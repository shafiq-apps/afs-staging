'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, Trash2 } from 'lucide-react';
import { Banner, Card } from './ui';

interface NodeStats {
    nodeId: string;
    nodeName: string;
    cpu: number;
    heapUsedPercent: number;
    ramUsedPercent: number;
    diskUsedPercent: number;
    timestamp: number;
    alerts: string[];
}

interface AlertEntry {
    nodeId: string;
    nodeName: string;
    alertType: 'cpu' | 'heap' | 'ram' | 'disk';
    value: number;
    threshold: number;
    timestamp: number;
}

const THRESHOLDS = {
    CPU: 85,
    HEAP: 80,
    RAM: 80,
    DISK: 90,
};

const getMetricStatus = (value: number, threshold: number): 'normal' | 'warning' | 'critical' => {
    if (value > threshold) return 'critical';
    if (value > threshold - 5) return 'warning';
    return 'normal';
};

const getStatusColor = (status: 'normal' | 'warning' | 'critical'): string => {
    switch (status) {
        case 'critical':
            return 'bg-red-700 text-red-100';
        case 'warning':
            return 'bg-yellow-700 text-yellow-100';
        default:
            return 'bg-green-700 text-green-100';
    }
};

const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
};

const getWebSocketUrl = (): string => {
    const envUrl = process.env.NEXT_PUBLIC_ES_WSS_URL;
    if (envUrl && envUrl.trim()) {
        const trimmed = envUrl.trim();
        if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
            return trimmed;
        }
        if (trimmed.startsWith('http://')) return trimmed.replace('http://', 'ws://');
        if (trimmed.startsWith('https://')) return trimmed.replace('https://', 'wss://');
        return trimmed;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.hostname}:3001`;
};

const fetchWebSocketToken = async (): Promise<string | undefined> => {
    try {
        const response = await fetch('/api/monitor/ws-token', {
            method: 'GET',
            credentials: 'include',
        });

        if (!response.ok) {
            return undefined;
        }

        const data = await response.json();
        return typeof data?.token === 'string' ? data.token : undefined;
    } catch {
        return undefined;
    }
};

export default function ESMonitoring() {
    const [stats, setStats] = useState<NodeStats[]>([]);
    const [alerts, setAlerts] = useState<AlertEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 10;
    const reconnectDelayMs = 3000;

    /**
     * Connect to WebSocket
     */
    const connect = useCallback((): void => {
        if (wsRef.current) {
            return; // Already connecting or connected
        }

        if (isConnecting) {
            return;
        }

        setIsConnecting(true);
        setError(null);

        try {
            // Try standalone WebSocket server first (production)
            // If not available, falls back to API route
            const wsUrl = getWebSocketUrl();

            console.log('[ESMonitoring] Attempting to connect to WebSocket:', wsUrl);

            let connectTimeout: NodeJS.Timeout;

            const initConnection = async () => {
                const wsToken = await fetchWebSocketToken();
                const ws = wsToken ? new WebSocket(wsUrl, [wsToken]) : new WebSocket(wsUrl);
                console.log(ws);
                ws.onopen = () => {
                    clearTimeout(connectTimeout);
                    console.log('[ESMonitoring] WebSocket connected');
                    setIsConnected(true);
                    setIsConnecting(false);
                    setError(null);
                    reconnectAttemptsRef.current = 0;
                };

                ws.onmessage = (event: MessageEvent) => {
                    try {
                        const message = JSON.parse(event.data);

                        switch (message.type) {
                            case 'connected':
                                console.log('[ESMonitoring] Received connected message');
                                if (message.payload?.stats) {
                                    setStats(message.payload.stats);
                                }
                                if (message.payload?.alerts) {
                                    setAlerts(message.payload.alerts);
                                }
                                break;

                            case 'stats':
                                if (message.payload) {
                                    setStats(message.payload);
                                }
                                break;

                            case 'alerts':
                                if (message.payload) {
                                    // Add new alerts to the beginning of the list
                                    setAlerts((prev) => {
                                        const combined = [...message.payload, ...prev];
                                        // Keep only the latest 50 alerts
                                        return combined.slice(0, 50);
                                    });
                                }
                                break;

                            case 'error':
                                console.error('[ESMonitoring] Server error:', message.payload?.message);
                                setError(message.payload?.message || 'Server error');
                                break;

                            default:
                                console.warn('[ESMonitoring] Unknown message type:', message.type);
                        }
                    } catch (error) {
                        console.error('[ESMonitoring] Error parsing message:', error);
                    }
                };

                ws.onerror = (event: Event) => {
                    clearTimeout(connectTimeout);
                    console.error('[ESMonitoring] WebSocket error:', event);
                    setError('WebSocket connection error');
                };

                ws.onclose = () => {
                    clearTimeout(connectTimeout);
                    console.log('[ESMonitoring] WebSocket disconnected');
                    setIsConnected(false);
                    setIsConnecting(false);
                    wsRef.current = null;

                    // Attempt to reconnect
                    if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                        reconnectAttemptsRef.current++;
                        console.log(
                            `[ESMonitoring] Reconnecting in ${reconnectDelayMs}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
                        );

                        reconnectTimerRef.current = setTimeout(() => {
                            connect();
                        }, reconnectDelayMs);
                    } else {
                        setError(`Failed to connect after ${maxReconnectAttempts} attempts. Please check WebSocket server.`);
                    }
                };

                // Set a timeout for connection attempt
                connectTimeout = setTimeout(() => {
                    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
                        console.warn('[ESMonitoring] Connection timeout');
                        ws.close();
                    }
                }, 5000);

                wsRef.current = ws;
            };

            initConnection();
        } catch (error) {
            console.error('[ESMonitoring] Connection error:', error);
            setError(error instanceof Error ? error.message : 'Connection failed');
            setIsConnecting(false);
        }
    }, [isConnecting]);

    /**
     * Disconnect from WebSocket
     */
    const disconnect = useCallback((): void => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        setIsConnected(false);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
    }, []);

    /**
     * Clear alert log
     */
    const clearAlerts = useCallback((): void => {
        setAlerts([]);
        // Optionally send a message to clear server-side logs too
    }, []);

    /**
     * Connect on mount
     */
    useEffect(() => {
        connect();

        return () => {
            disconnect();
        };
    }, []);

    return (
        <Card title='Elasticsearch Monitoring' className="mt-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">Elasticsearch Monitoring</h1>
                <div className="flex items-center gap-4">
                    {/* Connection Status */}
                    <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium ${isConnected
                            ? 'bg-green-800 text-green-100'
                            : error
                                ? 'bg-red-800 text-red-100'
                                : 'bg-yellow-800 text-yellow-100'
                            }`}
                    >
                        {isConnected ? (
                            <>
                                <Wifi size={16} />
                                Connected
                            </>
                        ) : isConnecting ? (
                            <>
                                <RefreshCw size={16} className="animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <WifiOff size={16} />
                                Disconnected
                            </>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <button
                        onClick={() => (isConnected ? disconnect() : connect())}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${isConnected
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                    >
                        {isConnected ? 'Disconnect' : 'Connect'}
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <Banner
                    title="Elasticsearch Error"
                    variant='error'
                    className='mb-6'
                >
                    <p>{error}</p>
                </Banner>
            )}

            {/* Node Stats Table */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-900">
                    <h2 className="text-xl font-semibold text-white">Node Statistics</h2>
                    <p className="text-sm text-gray-300 mt-1">
                        Real-time metrics from {stats.length} Elasticsearch node{stats.length !== 1 ? 's' : ''}
                    </p>
                </div>

                {stats.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500">
                        <p>Waiting for node data...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-96">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-900 border-b border-gray-700">
                                <tr>
                                    {
                                        ["Node Name", "CPU %", "Heap %", "RAM %", "Disk %", "Last Update"].map((header) => (
                                            <th key={header} className="px-6 py-3 text-left font-semibold text-gray-200">
                                                {header}
                                            </th>
                                        ))
                                    }
                                    </tr>
                            </thead>
                            <tbody>
                                {stats.map((node) => (
                                    <tr key={node.nodeId} className="border-b border-gray-700 hover:bg-gray-700">
                                        <td className="px-6 py-4 font-medium text-gray-100">{node.nodeName}</td>

                                        {/* CPU */}
                                        <td className="px-6 py-4">
                                            <div
                                                className={`inline-block px-3 py-1 rounded-full font-medium transition-colors ${getStatusColor(getMetricStatus(node.cpu, THRESHOLDS.CPU))}`}
                                            >
                                                {node.cpu.toFixed(2)}%
                                            </div>
                                        </td>

                                        {/* Heap */}
                                        <td className="px-6 py-4">
                                            <div
                                                className={`inline-block px-3 py-1 rounded-full font-medium transition-colors ${getStatusColor(getMetricStatus(node.heapUsedPercent, THRESHOLDS.HEAP))}`}
                                            >
                                                {node.heapUsedPercent.toFixed(2)}%
                                            </div>
                                        </td>

                                        {/* RAM */}
                                        <td className="px-6 py-4">
                                            <div
                                                className={`inline-block px-3 py-1 rounded-full font-medium transition-colors ${getStatusColor(getMetricStatus(node.ramUsedPercent, THRESHOLDS.RAM))}`}
                                            >
                                                {node.ramUsedPercent.toFixed(2)}%
                                            </div>
                                        </td>

                                        {/* Disk */}
                                        <td className="px-6 py-4">
                                            <div
                                                className={`inline-block px-3 py-1 rounded-full font-medium transition-colors ${getStatusColor(getMetricStatus(node.diskUsedPercent, THRESHOLDS.DISK))}`}
                                            >
                                                {node.diskUsedPercent.toFixed(2)}%
                                            </div>
                                        </td>

                                        {/* Timestamp */}
                                        <td className="px-6 py-4 text-gray-400">{formatTime(node.timestamp)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Alert Log */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-900 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Alert Log</h2>
                        <p className="text-sm text-gray-300 mt-1">{alerts.length} alert(s)</p>
                    </div>
                    <button
                        onClick={clearAlerts}
                        disabled={alerts.length === 0}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-100 font-medium transition-colors"
                    >
                        <Trash2 size={16} />
                        Clear
                    </button>
                </div>

                {alerts.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500">
                        <p>No alerts yet. All metrics within normal range.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-96">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-900 border-b border-gray-700">
                                <tr>
                                    {
                                        ["Node", "Alert Type", "Value", "Threshold", "Time"].map((header) => (
                                            <th key={header} className="px-6 py-3 text-left font-semibold text-white">
                                                {header}
                                            </th>
                                        ))
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                {alerts.map((alert, index) => (
                                    <tr key={`${alert.nodeId}-${alert.timestamp}-${index}`} className="border-b border-gray-700 hover:bg-gray-800">
                                        <td className="px-6 py-4 font-medium text-gray-100">{alert.nodeName}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-block px-2 py-1 rounded bg-red-700 text-red-100 font-semibold text-xs">
                                                {alert.alertType.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-red-300 font-semibold">{alert.value.toFixed(2)}%</td>
                                        <td className="px-6 py-4 text-gray-300">{alert.threshold}%</td>
                                        <td className="px-6 py-4 text-gray-400 text-xs">{formatTime(alert.timestamp)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
                <h3 className="font-semibold text-white mb-4">Threshold Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="border-l-4 border-green-400 pl-4">
                        <p className="font-medium text-gray-100">Normal</p>
                        <p className="text-sm text-gray-300">Below threshold</p>
                    </div>
                    <div className="border-l-4 border-yellow-400 pl-4">
                        <p className="font-medium text-gray-100">Warning</p>
                        <p className="text-sm text-gray-300">Within 5% of threshold</p>
                    </div>
                    <div className="border-l-4 border-red-400 pl-4">
                        <p className="font-medium text-gray-100">Critical</p>
                        <p className="text-sm text-gray-300">Exceeds threshold</p>
                    </div>
                    <div className="pl-4">
                        <div className="space-y-2 text-sm text-gray-200">
                            <div>CPU: {THRESHOLDS.CPU}%</div>
                            <div>Heap: {THRESHOLDS.HEAP}%</div>
                            <div>RAM: {THRESHOLDS.RAM}%</div>
                            <div>Disk: {THRESHOLDS.DISK}%</div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
