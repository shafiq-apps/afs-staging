import { NextRequest, NextResponse } from 'next/server';
import { verifyPIN } from '@/lib/auth.utils';
import { checkRateLimit } from '@/lib/rate-limit';
import { getUserByEmail, touchUserActivity } from '@/lib/user.storage';
import { generateToken } from '@/lib/jwt.utils';
import { createOrGetAdminUserInES } from '@/lib/admin-user-es';
import { z } from 'zod';

const verifySchema = z.object({
  email: z.string().email('Invalid email address'),
  pin: z.string().length(6, 'PIN code must be 6 digits'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, pin } = verifySchema.parse(body);
    
    // Normalize email for consistent lookup
    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[Verify PIN] Original email: ${email}, Normalized: ${normalizedEmail}`);

    // Rate limiting (use normalized email)
    const rateLimit = checkRateLimit(`verify-pin:${normalizedEmail}`, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Verify PIN (use normalized email)
    const isValid = verifyPIN(normalizedEmail, pin);

    if (!isValid) {
      console.log(`[Verify PIN] Verification failed for: ${normalizedEmail}`);
      return NextResponse.json(
        { error: 'Invalid or expired PIN code' },
        { status: 401 }
      );
    }

    console.log(`[Verify PIN] Verification successful for: ${normalizedEmail}`);

    // Only allow existing users and verify super admin
    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return NextResponse.json(
        { error: 'Access denied. User account is not provisioned.' },
        { status: 403 }
      );
    }
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 403 }
      );
    }
    if (user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    const activeUser = (await touchUserActivity({
      userId: user.id,
      email: user.email,
      force: true,
    })) ?? user;

    // Try to create/update user in ES and get API credentials
    let apiCredentials = null;
    try {
      const esResult = await createOrGetAdminUserInES({
        email: activeUser.email,
        name: activeUser.name,
        role: activeUser.role,
        permissions: activeUser.permissions,
        isActive: activeUser.isActive,
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
      userId: activeUser.id,
      email: activeUser.email,
      role: activeUser.role,
      permissions: activeUser.permissions,
    });

    // Set cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: activeUser.id,
        email: activeUser.email,
        name: activeUser.name,
        role: activeUser.role,
        permissions: activeUser.permissions,
        lastActiveAt: activeUser.lastActiveAt,
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

    console.error('Error verifying PIN:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

