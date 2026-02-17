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

const ALERT_TYPES: AlertEntry['alertType'][] = ['cpu', 'heap', 'ram', 'disk'];
const FALLBACK_STATS_POLL_INTERVAL_MS = 5000;

const getMetricStatus = (value: number, threshold: number): 'normal' | 'warning' | 'critical' => {
    if (value > threshold) return 'critical';
    if (value > threshold - 5) return 'warning';
    return 'normal';
};

const getStatusColor = (status: 'normal' | 'warning' | 'critical'): string => {
    switch (status) {
        case 'critical':
            return 'bg-blue-700 text-blue-100';
        case 'warning':
            return 'bg-yellow-700 text-yellow-100';
        default:
            return 'bg-emerald-700 text-emerald-100';
    }
};

const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
};

const getDefaultWebSocketProtocol = (): 'ws:' | 'wss:' => {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        return 'wss:';
    }
    return 'ws:';
};

const normalizeWebSocketUrl = (rawUrl: string): string => {
    const trimmed = rawUrl.trim();
    const wsProtocol = getDefaultWebSocketProtocol();

    if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
        return trimmed;
    }

    if (trimmed.startsWith('http://')) {
        return trimmed.replace('http://', 'ws://');
    }

    if (trimmed.startsWith('https://')) {
        return trimmed.replace('https://', 'wss://');
    }

    if (trimmed.startsWith('//')) {
        return `${wsProtocol}${trimmed}`;
    }

    if (trimmed.startsWith('/')) {
        if (typeof window === 'undefined') {
            return `${wsProtocol}//localhost${trimmed}`;
        }
        return `${wsProtocol}//${window.location.host}${trimmed}`;
    }

    return `${wsProtocol}//${trimmed}`;
};

const flipWebSocketProtocol = (url: string): string | undefined => {
    if (url.startsWith('ws://')) {
        return url.replace('ws://', 'wss://');
    }
    if (url.startsWith('wss://')) {
        return url.replace('wss://', 'ws://');
    }
    return undefined;
};

const getWebSocketUrls = (): string[] => {
    const urls: string[] = [];
    const seen = new Set<string>();

    const addUrl = (candidate?: string): void => {
        if (!candidate || !candidate.trim()) {
            return;
        }

        const normalized = normalizeWebSocketUrl(candidate);
        if (!seen.has(normalized)) {
            seen.add(normalized);
            urls.push(normalized);
        }

        const alternateProtocol = flipWebSocketProtocol(normalized);
        if (alternateProtocol && !seen.has(alternateProtocol)) {
            seen.add(alternateProtocol);
            urls.push(alternateProtocol);
        }
    };

    addUrl(process.env.NEXT_PUBLIC_ES_WSS_URL);

    if (typeof window !== 'undefined') {
        const wsProtocol = getDefaultWebSocketProtocol();
        addUrl(`${wsProtocol}//${window.location.hostname}:3001`);
        addUrl(`${wsProtocol}//${window.location.host}/api/monitor/websocket`);
    }

    if (urls.length === 0) {
        addUrl('ws://localhost:3001');
    }

    return urls;
};

const getStaticWebSocketToken = (): string | undefined => {
    const token = process.env.NEXT_PUBLIC_ES_WSS_TOKEN;
    if (token && token.trim()) {
        return token.trim();
    }
    return undefined;
};

const fetchWebSocketToken = async (): Promise<string | undefined> => {
    const staticToken = getStaticWebSocketToken();

    try {
        const response = await fetch('/api/monitor/ws-token', {
            method: 'GET',
            credentials: 'include',
        });

        if (!response.ok) {
            return staticToken;
        }

        const data = await response.json();
        if (typeof data?.token === 'string' && data.token.trim()) {
            return data.token.trim();
        }

        return staticToken;
    } catch {
        return staticToken;
    }
};

const toNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return fallback;
};

const normalizeNodeStats = (payload: unknown): NodeStats[] => {
    if (!Array.isArray(payload)) {
        return [];
    }

    return payload.map((item, index) => {
        const stats = (item ?? {}) as Partial<NodeStats>;

        return {
            nodeId: typeof stats.nodeId === 'string' ? stats.nodeId : `node-${index}`,
            nodeName: typeof stats.nodeName === 'string' ? stats.nodeName : `Node ${index + 1}`,
            cpu: toNumber(stats.cpu),
            heapUsedPercent: toNumber(stats.heapUsedPercent),
            ramUsedPercent: toNumber(stats.ramUsedPercent),
            diskUsedPercent: toNumber(stats.diskUsedPercent),
            timestamp: toNumber(stats.timestamp, Date.now()),
            alerts: Array.isArray(stats.alerts) ? stats.alerts.filter((value): value is string => typeof value === 'string') : [],
        };
    });
};

const getAlertThreshold = (alertType: AlertEntry['alertType']): number => {
    switch (alertType) {
        case 'cpu':
            return THRESHOLDS.CPU;
        case 'heap':
            return THRESHOLDS.HEAP;
        case 'ram':
            return THRESHOLDS.RAM;
        case 'disk':
            return THRESHOLDS.DISK;
    }
};

const normalizeAlertEntry = (payload: unknown): AlertEntry | null => {
    const entry = (payload ?? {}) as Partial<AlertEntry> & { type?: string };
    const candidateType = typeof entry.alertType === 'string' ? entry.alertType : entry.type;

    if (!candidateType || !ALERT_TYPES.includes(candidateType as AlertEntry['alertType'])) {
        return null;
    }

    const alertType = candidateType as AlertEntry['alertType'];

    return {
        nodeId: typeof entry.nodeId === 'string' ? entry.nodeId : 'unknown-node',
        nodeName: typeof entry.nodeName === 'string' ? entry.nodeName : 'Unknown Node',
        alertType,
        value: toNumber(entry.value),
        threshold: toNumber(entry.threshold, getAlertThreshold(alertType)),
        timestamp: toNumber(entry.timestamp, Date.now()),
    };
};

const normalizeAlertEntries = (payload: unknown): AlertEntry[] => {
    if (!Array.isArray(payload)) {
        return [];
    }

    return payload
        .map(normalizeAlertEntry)
        .filter((entry): entry is AlertEntry => Boolean(entry));
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
    const connectAttemptRef = useRef(0);
    const manualDisconnectRef = useRef(false);
    const fallbackPollTimerRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectFnRef = useRef<() => void>(() => undefined);
    const maxReconnectAttempts = 10;
    const reconnectDelayMs = 3000;

    const pollStatsSnapshot = useCallback(async (): Promise<void> => {
        try {
            const response = await fetch('/api/monitor/stats', {
                method: 'GET',
                credentials: 'include',
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            setStats(normalizeNodeStats(data?.stats));
        } catch (pollError) {
            console.error('[ESMonitoring] Fallback stats polling failed:', pollError);
        }
    }, []);

    const startFallbackPolling = useCallback((): void => {
        if (fallbackPollTimerRef.current) {
            return;
        }

        void pollStatsSnapshot();
        fallbackPollTimerRef.current = setInterval(() => {
            void pollStatsSnapshot();
        }, FALLBACK_STATS_POLL_INTERVAL_MS);
    }, [pollStatsSnapshot]);

    const stopFallbackPolling = useCallback((): void => {
        if (fallbackPollTimerRef.current) {
            clearInterval(fallbackPollTimerRef.current);
            fallbackPollTimerRef.current = null;
        }
    }, []);

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

        manualDisconnectRef.current = false;
        const attemptId = ++connectAttemptRef.current;

        setIsConnecting(true);
        setError(null);

        const connectWithFallbacks = async (): Promise<void> => {
            const wsUrls = getWebSocketUrls();
            const wsToken = await fetchWebSocketToken();
            let lastError = 'WebSocket connection error';

            for (const wsUrl of wsUrls) {
                if (attemptId !== connectAttemptRef.current || manualDisconnectRef.current) {
                    return;
                }

                console.log('[ESMonitoring] Attempting to connect to WebSocket:', wsUrl);

                const connected = await new Promise<boolean>((resolve) => {
                    let settled = false;
                    let connectTimeout: NodeJS.Timeout | null = null;
                    let ws: WebSocket;

                    const settle = (didConnect: boolean): void => {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        if (connectTimeout) {
                            clearTimeout(connectTimeout);
                        }
                        resolve(didConnect);
                    };

                    try {
                        ws = wsToken ? new WebSocket(wsUrl, [wsToken]) : new WebSocket(wsUrl);
                    } catch (wsError) {
                        lastError = wsError instanceof Error ? wsError.message : 'Invalid WebSocket URL';
                        settle(false);
                        return;
                    }

                    connectTimeout = setTimeout(() => {
                        console.warn('[ESMonitoring] Connection timeout:', wsUrl);
                        lastError = `Connection timeout for ${wsUrl}`;
                        ws.close();
                        settle(false);
                    }, 5000);

                    ws.onopen = () => {
                        if (attemptId !== connectAttemptRef.current || manualDisconnectRef.current) {
                            ws.close();
                            settle(false);
                            return;
                        }

                        wsRef.current = ws;
                        stopFallbackPolling();
                        setIsConnected(true);
                        setIsConnecting(false);
                        setError(null);
                        reconnectAttemptsRef.current = 0;

                        console.log('[ESMonitoring] WebSocket connected:', wsUrl);

                        ws.onmessage = (event: MessageEvent) => {
                            try {
                                const message = JSON.parse(event.data);

                                switch (message.type) {
                                    case 'connected': {
                                        const connectedStats = normalizeNodeStats(message.payload?.stats ?? message.stats);
                                        const connectedAlerts = normalizeAlertEntries(message.payload?.alerts ?? message.alerts);
                                        setStats(connectedStats);
                                        setAlerts(connectedAlerts.slice(0, 50));
                                        break;
                                    }

                                    case 'stats': {
                                        const updatedStats = normalizeNodeStats(message.payload);
                                        setStats(updatedStats);
                                        break;
                                    }

                                    case 'alerts': {
                                        const updatedAlerts = normalizeAlertEntries(message.payload);
                                        if (updatedAlerts.length > 0) {
                                            setAlerts((prev) => {
                                                const combined = [...updatedAlerts, ...prev];
                                                return combined.slice(0, 50);
                                            });
                                        }
                                        break;
                                    }

                                    case 'error':
                                        console.error('[ESMonitoring] Server error:', message.payload?.message);
                                        setError(message.payload?.message || 'Server error');
                                        break;

                                    default:
                                        console.warn('[ESMonitoring] Unknown message type:', message.type);
                                }
                            } catch (parseError) {
                                console.error('[ESMonitoring] Error parsing message:', parseError);
                            }
                        };

                        ws.onerror = (event: Event) => {
                            console.error('[ESMonitoring] WebSocket runtime error:', event);
                            setError('WebSocket interrupted. Using HTTP polling while reconnecting.');
                            startFallbackPolling();
                        };

                        ws.onclose = () => {
                            console.log('[ESMonitoring] WebSocket disconnected');
                            setIsConnected(false);
                            setIsConnecting(false);
                            wsRef.current = null;

                            if (manualDisconnectRef.current) {
                                return;
                            }

                            startFallbackPolling();

                            if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                                reconnectAttemptsRef.current++;
                                console.log(
                                    `[ESMonitoring] Reconnecting in ${reconnectDelayMs}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
                                );
                                setError(
                                    `WebSocket disconnected. Retrying (${reconnectAttemptsRef.current}/${maxReconnectAttempts}) while showing HTTP stats.`
                                );
                                reconnectTimerRef.current = setTimeout(() => {
                                    reconnectFnRef.current();
                                }, reconnectDelayMs);
                            } else {
                                setError('WebSocket unavailable. Showing data via HTTP polling.');
                            }
                        };

                        settle(true);
                    };

                    ws.onerror = (event: Event) => {
                        console.error('[ESMonitoring] WebSocket handshake error:', event);
                        lastError = `Handshake failed for ${wsUrl}`;
                        ws.close();
                        settle(false);
                    };

                    ws.onclose = () => {
                        settle(false);
                    };
                });

                if (connected) {
                    return;
                }
            }

            if (attemptId !== connectAttemptRef.current || manualDisconnectRef.current) {
                return;
            }

            setIsConnected(false);
            setIsConnecting(false);
            wsRef.current = null;
            startFallbackPolling();

            if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                reconnectAttemptsRef.current++;
                setError(
                    `WebSocket unavailable (${lastError}). Retrying (${reconnectAttemptsRef.current}/${maxReconnectAttempts}) while showing HTTP stats.`
                );
                reconnectTimerRef.current = setTimeout(() => {
                    reconnectFnRef.current();
                }, reconnectDelayMs);
            } else {
                setError('WebSocket unavailable. Showing data via HTTP polling.');
            }
        };

        void connectWithFallbacks();
    }, [isConnecting, startFallbackPolling, stopFallbackPolling]);

    /**
     * Disconnect from WebSocket
     */
    const disconnect = useCallback((): void => {
        manualDisconnectRef.current = true;
        connectAttemptRef.current++;

        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        stopFallbackPolling();
        setIsConnected(false);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
    }, [stopFallbackPolling]);

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
        reconnectFnRef.current = connect;
    }, [connect]);

    useEffect(() => {
        reconnectFnRef.current();

        return () => {
            disconnect();
        };
    }, [disconnect]);

    return (
        <Card title='Elasticsearch Monitoring' className="mt-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">Elasticsearch Monitoring</h1>
                <div className="flex items-center gap-4">
                    {/* Connection Status */}
                    <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium ${isConnected
                            ? 'bg-emerald-800 text-emerald-100'
                            : error
                                ? 'bg-blue-800 text-blue-100'
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
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
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
                    <div className="max-h-96">
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
                    <div className="max-h-96">
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
                                            <span className="inline-block px-2 py-1 rounded bg-blue-700 text-blue-100 font-semibold text-xs">
                                                {alert.alertType.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-blue-300 font-semibold">{alert.value.toFixed(2)}%</td>
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
                    <div className="border-l-4 border-emerald-400 pl-4">
                        <p className="font-medium text-gray-100">Normal</p>
                        <p className="text-sm text-gray-300">Below threshold</p>
                    </div>
                    <div className="border-l-4 border-yellow-400 pl-4">
                        <p className="font-medium text-gray-100">Warning</p>
                        <p className="text-sm text-gray-300">Within 5% of threshold</p>
                    </div>
                    <div className="border-l-4 border-blue-400 pl-4">
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
