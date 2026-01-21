import jwt from 'jsonwebtoken';
import { SessionData } from '@/types/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRY = '7d'; // 7 days

export function generateToken(sessionData: Omit<SessionData, 'iat' | 'exp'>): string {
  return jwt.sign(sessionData, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
}

export function verifyToken(token: string): SessionData | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionData;
    return decoded;
  } catch (error) {
    return null;
  }
}

