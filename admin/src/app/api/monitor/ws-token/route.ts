import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { verifyToken } from '@/lib/jwt.utils';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const WS_TOKEN_EXPIRY = process.env.WS_TOKEN_EXPIRY || '300000';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const wsToken = jwt.sign(
      { type: 'ws', userId: session.userId },
      JWT_SECRET,
      { expiresIn: parseInt(WS_TOKEN_EXPIRY) }
    );

    return NextResponse.json({ token: wsToken, expiresIn: WS_TOKEN_EXPIRY });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create WS token' }, { status: 500 });
  }
}
