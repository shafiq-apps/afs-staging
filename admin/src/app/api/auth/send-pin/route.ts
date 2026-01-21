import { NextRequest, NextResponse } from 'next/server';
import { storePIN, generatePIN } from '@/lib/auth.utils';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendEmail, formatPINEmailHTML } from '@/lib/email.service';
import { getOrCreateUserByEmail } from '@/lib/user.storage';
import { z } from 'zod';

const emailSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = emailSchema.parse(body);

    // Get or create user and verify super admin
    const user = getOrCreateUserByEmail(email);
    if (user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    // Rate limiting
    const rateLimit = checkRateLimit(`pin:${email}`, {
      maxRequests: 3,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Generate and store PIN
    const pinCode = generatePIN();
    storePIN(email, pinCode);

    // Log PIN to server console for development
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('PIN CODE FOR DEVELOPMENT (SUPER ADMIN - SERVER CONSOLE)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Email: ${email}`);
    console.log(`PIN Code: ${pinCode}`);
    console.log(`Expires in: 5 minutes`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n');
    
    // Also write to stdout to ensure it appears in server console
    process.stdout.write(`\nPIN CODE: ${pinCode} for ${email} (SUPER ADMIN)\n\n`);

    // Send email
    try {
      console.log(`Attempting to send PIN email to: ${email}`);
      await sendEmail({
        to: email,
        subject: 'Your Super Admin PIN Code',
        text: `Your PIN code is: ${pinCode}. This code will expire in 5 minutes.`,
        html: formatPINEmailHTML(pinCode),
      });
      console.log(`PIN email sent successfully to: ${email}`);
    } catch (emailError: any) {
      console.error('Failed to send PIN email:', emailError);
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
      message: 'PIN code sent successfully',
      expiresIn: 300, // 5 minutes in seconds
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Error sending PIN:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

