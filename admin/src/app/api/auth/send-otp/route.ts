import { NextRequest, NextResponse } from 'next/server';
import { generateOTP, storeOTP } from '@/lib/auth.utils';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendEmail, formatOTPEmailHTML } from '@/lib/email.service';
import { getOrCreateUserByEmail } from '@/lib/user.storage';
import { z } from 'zod';

const emailSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    // Log email configuration status
    const hasApiKey = !!process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.APP_EMAIL_FROM || 'noreply@digitalcoo.com';
    console.log('Email Service Status:', {
      hasApiKey: hasApiKey ? 'Configured' : 'Missing',
      fromEmail,
    });

    const body = await request.json();
    const { email } = emailSchema.parse(body);

    // Rate limiting
    const rateLimit = checkRateLimit(`otp:${email}`, {
      maxRequests: 3,
      windowMs: 15 * 60 * 1000, // 3 requests per 15 minutes
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Get or create user automatically
    const user = getOrCreateUserByEmail(email);
    console.log(`User: ${user.email}, Role: ${user.role}, Active: ${user.isActive}`);

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is inactive. Please contact support.' },
        { status: 403 }
      );
    }

    // Generate and store OTP
    const otpCode = generateOTP();
    const isSuperAdmin = user.role === 'super_admin';
    storeOTP(email, otpCode, isSuperAdmin);

    // Log OTP to server console for development
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('OTP CODE FOR DEVELOPMENT (SERVER CONSOLE)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Email: ${email}`);
    console.log(`OTP Code: ${otpCode}`);
    console.log(`Super Admin: ${isSuperAdmin ? 'Yes' : 'No'}`);
    console.log(`Expires in: 5 minutes`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n');
    
    // Also write to stdout to ensure it appears in server console
    process.stdout.write(`\nOTP CODE: ${otpCode} for ${email}\n\n`);

    // Send email
    try {
      console.log(`Attempting to send OTP email to: ${email}`);
      await sendEmail({
        to: email,
        subject: 'Your DigitalCoo Admin Login Code',
        text: `Your login code is: ${otpCode}. This code will expire in 5 minutes.`,
        html: formatOTPEmailHTML(otpCode, isSuperAdmin),
      });
      console.log(`OTP email sent successfully to: ${email}`);
    } catch (emailError: any) {
      console.error('Failed to send OTP email:', emailError);
      console.error('Error details:', {
        message: emailError?.message,
        response: emailError?.response?.body,
        code: emailError?.code,
        stack: emailError?.stack,
      });
      return NextResponse.json(
        { 
          error: 'Failed to send email. Please try again later.',
          details: process.env.NODE_ENV === 'development' ? emailError?.message : undefined
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'OTP code sent successfully',
      expiresIn: 300, // 5 minutes in seconds
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Error sending OTP:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

