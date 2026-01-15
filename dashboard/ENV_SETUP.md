# Environment Setup Guide

## Support Email Configuration (SendGrid)

To enable the support request feature, you need to configure SendGrid email service.

### Step 1: Get SendGrid API Key

1. Sign up or log in to [SendGrid](https://app.sendgrid.com/)
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Choose **Full Access** or at minimum **Mail Send** permission
5. Copy the API key (you won't be able to see it again!)

### Step 2: Verify Sender Email

SendGrid requires sender verification to prevent spam:

**Option A: Single Sender Verification (Quick, for testing)**
1. Go to **Settings** → **Sender Authentication** → **Single Sender Verification**
2. Click **Create New Sender**
3. Fill in your details with the email you want to send from
4. Verify the email address via the verification link sent to your inbox

**Option B: Domain Authentication (Recommended for production)**
1. Go to **Settings** → **Sender Authentication** → **Authenticate Your Domain**
2. Follow the DNS setup instructions for your domain
3. This allows you to send from any email address @yourdomain.com

### Step 3: Configure Environment Variables

Add these variables to your `.env.local` file (create it if it doesn't exist):

```bash
# SendGrid Email Configuration
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
APP_EMAIL_FROM=support@yourdomain.com
APP_EMAIL_NAME=Your App Name Support
```

**Important:**
- `APP_EMAIL_FROM` MUST be a verified sender email (from Step 2)
- Use the actual verified email address, not a placeholder

### Step 4: Restart Dev Server

After adding the environment variables, restart your Remix dev server:

```bash
npm run dev
```

### Step 5: Test Support Form

1. Navigate to the Support page in your app
2. Fill out the support form
3. Submit the form
4. Check your terminal logs for detailed SendGrid responses

### Expected Logs

On successful submission, you should see:

```
[2026-01-14T...] [email-service] [INFO] Processing support email request
[2026-01-14T...] [email-service] [INFO] SendGrid configuration check
[2026-01-14T...] [email-service] [INFO] Generated ticket ID
[2026-01-14T...] [email-service] [INFO] Sending notification to support team
[2026-01-14T...] [email-service] [INFO] Support team notification sent successfully
[2026-01-14T...] [email-service] [INFO] Sending confirmation to customer
[2026-01-14T...] [email-service] [INFO] Customer confirmation sent successfully
```

### Troubleshooting

#### Error: "SendGrid not configured"
- Make sure all three environment variables are set in `.env.local`
- Restart the dev server after adding variables

#### Error: "Request failed with status 400: Validation failed"
- Your sender email is not verified in SendGrid
- Go back to Step 2 and verify your sender email

#### Error: "Request failed with status 403: Forbidden"
- Your API key doesn't have permission to send emails
- Create a new API key with **Mail Send** permission

#### Emails not received
- Check spam/junk folder
- Verify the recipient email address is correct
- Check SendGrid Activity Feed for delivery status

### Production Setup

For production, add the same variables to your hosting environment:

**Heroku:**
```bash
heroku config:set SENDGRID_API_KEY=SG.xxx...
heroku config:set APP_EMAIL_FROM=support@yourdomain.com
heroku config:set APP_EMAIL_NAME="Your App Name Support"
```

**Vercel:**
Add them in Project Settings → Environment Variables

**AWS/Other:**
Use your platform's environment variable configuration

## Support Configuration

You can customize support settings in `dashboard/app/config/support.config.ts`:

- Contact email
- Phone number
- Support hours
- Documentation links
- Form validation rules
- Priority levels

## How It Works

1. User fills out support form
2. Form data sent to `app.support.tsx` action
3. Action calls `sendSupportEmail()` function
4. Function sends two emails:
   - **To support team**: Full ticket details
   - **To customer**: Confirmation with ticket ID
5. Function attempts to save ticket to database (non-critical)
6. User sees success message

If database save fails, emails are still sent successfully - the ticket is stored with a generated ID.



