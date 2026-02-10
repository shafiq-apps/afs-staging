/**
 * Current Stats Snapshot API
 * GET /api/monitor/stats - Get current Elasticsearch node stats
 * 
 * Quick endpoint to fetch current stats without WebSocket
 */

import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';

interface NodeStats {
  nodeId: string;
  nodeName: string;
  cpu: number;
  heapUsedPercent: number;
  ramUsedPercent: number;
  diskUsedPercent: number;
  timestamp: number;
}

export async function GET(request: NextRequest) {
  try {
    const esClient = getESClient();

    // Get node stats from Elasticsearch
    const response = await esClient.nodes.stats({
      metric: ['os', 'jvm', 'fs'],
    });

    const nodesData = response.nodes || {};
    const stats: NodeStats[] = [];

    // Process each node
    for (const [nodeId, nodeInfo] of Object.entries(nodesData)) {
      const node = nodeInfo as any;
      const nodeName = node.name || nodeId;

      // CPU percentage
      const cpuPercent = node.os?.cpu?.percent || 0;

      // JVM Heap usage percentage
      const heapUsedBytes = node.jvm?.mem?.heap_used_in_bytes || 0;
      const heapMaxBytes = node.jvm?.mem?.heap_max_in_bytes || 1;
      const heapUsedPercent = (heapUsedBytes / heapMaxBytes) * 100;

      // Physical RAM usage percentage
      const osMemUsedBytes = node.os?.mem?.used_in_bytes || 0;
      const osMemTotalBytes = node.os?.mem?.total_in_bytes || 1;
      const ramUsedPercent = (osMemUsedBytes / osMemTotalBytes) * 100;

      // Disk usage percentage
      let diskUsedPercent = 0;
      if (node.fs?.total) {
        const diskAvailableBytes = node.fs.total.available_in_bytes || 0;
        const diskTotalBytes = node.fs.total.total_in_bytes || 1;
        diskUsedPercent = ((diskTotalBytes - diskAvailableBytes) / diskTotalBytes) * 100;
      }

      stats.push({
        nodeId,
        nodeName,
        cpu: Math.round(cpuPercent * 100) / 100,
        heapUsedPercent: Math.round(heapUsedPercent * 100) / 100,
        ramUsedPercent: Math.round(ramUsedPercent * 100) / 100,
        diskUsedPercent: Math.round(diskUsedPercent * 100) / 100,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      stats,
      nodeCount: stats.length,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('[StatsAPI] Error:', error?.message);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to fetch stats',
      },
      { status: 500 }
    );
  }
}
