import { NextRequest, NextResponse } from 'next/server';
import { verifyOTP } from '@/lib/auth.utils';
import { checkRateLimit } from '@/lib/rate-limit';
import { getOrCreateUserByEmail } from '@/lib/user.storage';
import { generateToken } from '@/lib/jwt.utils';
import { z } from 'zod';

const verifySchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'OTP code must be 6 digits'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = verifySchema.parse(body);

    // Rate limiting
    const rateLimit = checkRateLimit(`verify:${email}`, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Verify OTP
    const { valid, isSuperAdmin } = verifyOTP(email, code);

    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid or expired OTP code' },
        { status: 401 }
      );
    }

    // Get or create user
    const user = getOrCreateUserByEmail(email);
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 403 }
      );
    }

    // If super admin, require PIN
    if (isSuperAdmin) {
      return NextResponse.json({
        requiresPin: true,
        message: 'PIN code required for super admin',
      });
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    });

    // Set cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Error verifying OTP:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

