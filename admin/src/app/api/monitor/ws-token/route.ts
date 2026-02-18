import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { requirePermission } from '@/lib/api-auth';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const WS_TOKEN_EXPIRY = process.env.WS_TOKEN_EXPIRY || '300000';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'canViewMonitoring');
    if (authResult instanceof Response) {
      return authResult;
    }

    const wsToken = jwt.sign(
      { type: 'ws', userId: authResult.user.id },
      JWT_SECRET,
      { expiresIn: parseInt(WS_TOKEN_EXPIRY) }
    );

    return NextResponse.json({ token: wsToken, expiresIn: WS_TOKEN_EXPIRY });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create WS token' }, { status: 500 });
  }
}
