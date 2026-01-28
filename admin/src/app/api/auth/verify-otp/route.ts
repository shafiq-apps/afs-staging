import { NextRequest, NextResponse } from 'next/server';
import { verifyOTP } from '@/lib/auth.utils';
import { checkRateLimit } from '@/lib/rate-limit';
import { getOrCreateUserByEmail, getDefaultPermissions } from '@/lib/user.storage';
import { generateToken } from '@/lib/jwt.utils';
import { createOrGetAdminUserInES } from '@/lib/admin-user-es';
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

    // Normalize email for consistent lookup
    const normalizedEmail = email.trim().toLowerCase();
    
    // Verify OTP
    const { valid, isSuperAdmin } = verifyOTP(normalizedEmail, code);

    if (!valid) {
      console.log(`[Verify OTP] Verification failed for: ${normalizedEmail}`);
      return NextResponse.json(
        { error: 'Invalid or expired OTP code' },
        { status: 401 }
      );
    }

    console.log(`[Verify OTP] Verification successful for: ${normalizedEmail}`);

    // Get or create user (await the async function)
    const user = await getOrCreateUserByEmail(normalizedEmail);
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

    // Try to create/update user in ES and get API credentials
    let apiCredentials = null;
    try {
      const esResult = await createOrGetAdminUserInES({
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
        isActive: user.isActive,
      });
      
      if (esResult.apiKey && esResult.apiSecret) {
        apiCredentials = {
          apiKey: esResult.apiKey,
          apiSecret: esResult.apiSecret,
        };
      }
    } catch (error: any) {
      // Log but don't fail - user can still login with in-memory storage
      console.warn('Failed to sync user to ES:', error?.message || error);
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
      ...(apiCredentials && { apiCredentials }),
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

