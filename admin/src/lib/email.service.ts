import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const APP_EMAIL_FROM = process.env.APP_EMAIL_FROM || 'noreply@digitalcoo.com';
const APP_EMAIL_NAME = process.env.APP_EMAIL_NAME || 'DigitalCoo Admin';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  // Check configuration
  if (!SENDGRID_API_KEY) {
    const error = 'SENDGRID_API_KEY is not configured';
    console.error('Email Configuration Error:', error);
    console.error('Please set SENDGRID_API_KEY in your .env.local file');
    throw new Error(error);
  }

  // Log email configuration (without exposing API key)
  console.log('Email Configuration:');
  console.log(`From: ${APP_EMAIL_FROM} (${APP_EMAIL_NAME})`);
  console.log(`To: ${options.to}`);
  console.log(`Subject: ${options.subject}`);
  console.log(`API Key: ${SENDGRID_API_KEY ? 'Set' : 'Missing'}`);

  try {
    const msg = {
      to: options.to,
      from: {
        email: APP_EMAIL_FROM,
        name: APP_EMAIL_NAME,
      },
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    console.log('Sending email via SendGrid...');
    const response = await sgMail.send(msg);
    
    console.log('Email sent successfully');
    console.log('SendGrid Response:', {
      statusCode: response[0]?.statusCode
    });
  } catch (error: any) {
    console.error('SendGrid Error Details:');
    console.error('Message:', error?.message);
    console.error('Code:', error?.code);
    
    if (error?.response) {
      console.error('Response Status:', error.response.statusCode);
      console.error('Response Body:', JSON.stringify(error.response.body, null, 2));
      console.error('Response Headers:', error.response.headers);
    }

    // Common SendGrid errors
    if (error?.code === 401) {
      console.error('Authentication failed - Check your SENDGRID_API_KEY');
    } else if (error?.code === 403) {
      console.error('Forbidden - Check your SendGrid account permissions');
    } else if (error?.response?.body?.errors) {
      console.error('SendGrid Validation Errors:');
      error.response.body.errors.forEach((err: any, index: number) => {
        console.error(`Error ${index + 1}:`, err);
      });
    }

    throw new Error(`Failed to send email: ${error?.message || 'Unknown error'}`);
  }
}

export function formatOTPEmailHTML(otpCode: string, isSuperAdmin: boolean = false): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
          .content { padding: 40px 30px; }
          .otp-box { background-color: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }
          .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>DigitalCoo Admin Panel</h1>
          </div>
          <div class="content">
            <h2 style="color: #333; margin-top: 0;">Your Login Code</h2>
            <p>Use the following code to complete your login:</p>
            <div class="otp-box">
              <div class="otp-code">${otpCode}</div>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code will expire in 5 minutes.</p>
            ${isSuperAdmin ? `
            <div class="warning">
              <strong>⚠️ Super Admin Login:</strong> After entering this OTP, you will be prompted for a PIN code.
            </div>
            ` : ''}
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              If you didn't request this code, please ignore this email or contact support if you have concerns.
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message from DigitalCoo Admin Panel.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function formatPINEmailHTML(pinCode: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
          .content { padding: 40px 30px; }
          .pin-box { background-color: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }
          .pin-code { font-size: 36px; font-weight: bold; color: #dc2626; letter-spacing: 12px; font-family: 'Courier New', monospace; }
          .warning { background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Super Admin PIN Code</h1>
          </div>
          <div class="content">
            <h2 style="color: #333; margin-top: 0;">Your PIN Code</h2>
            <p>You are logging in as a <strong>Super Admin</strong>. Use the following PIN code:</p>
            <div class="pin-box">
              <div class="pin-code">${pinCode}</div>
            </div>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> This PIN code is valid for 5 minutes only. Do not share this code with anyone.
            </div>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              If you didn't request this PIN, please contact security immediately.
            </p>
          </div>
          <div class="footer">
            <p>This is an automated security message from DigitalCoo Admin Panel.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

