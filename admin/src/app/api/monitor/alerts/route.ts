/**
 * Alert Retrieval API
 * GET /api/monitor/alerts - Get alerts with various filters
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTodayAlerts,
  getAlertsByDateRange,
  getAlertsByNode,
  getAlertsByType,
  getAlertStats,
} from '@/lib/alert-logger';
import { requirePermission } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'canViewMonitoring');
    if (authResult instanceof Response) {
      return authResult;
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const nodeId = searchParams.get('nodeId');
    const alertType = searchParams.get('alertType');
    const limit = parseInt(searchParams.get('limit') || '100');

    let data: any = [];

    if (action === 'stats') {
      // Get statistics
      data = getAlertStats(date || undefined);
    } else if (action === 'range' && startDate && endDate) {
      // Get alerts by date range
      data = getAlertsByDateRange(startDate, endDate).slice(-limit);
    } else if (action === 'node' && nodeId) {
      // Get alerts by node
      data = getAlertsByNode(nodeId, limit);
    } else if (action === 'type' && alertType) {
      // Get alerts by type
      const validTypes = ['cpu', 'heap', 'ram', 'disk'];
      if (!validTypes.includes(alertType)) {
        return NextResponse.json(
          { success: false, error: 'Invalid alert type' },
          { status: 400 }
        );
      }
      data = getAlertsByType(alertType as any, limit);
    } else {
      // Default: get today's alerts
      data = getTodayAlerts().slice(-limit);
    }

    return NextResponse.json({
      success: true,
      data,
      count: Array.isArray(data) ? data.length : 0,
    });
  } catch (error: any) {
    console.error('[AlertAPI] Error:', error?.message);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to retrieve alerts',
      },
      { status: 500 }
    );
  }
}
