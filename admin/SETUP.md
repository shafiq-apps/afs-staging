# Admin Panel Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   cd admin
   npm install
   ```

2. **Configure Environment Variables**
   
   Create a `.env.local` file in the `admin` directory:
   ```env
   SENDGRID_API_KEY=your_sendgrid_api_key
   APP_EMAIL_FROM=noreply@digitalcoo.com
   APP_EMAIL_NAME=DigitalCoo Admin
   JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
   NODE_ENV=development
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Access the Admin Panel**
   - Open http://localhost:3000
   - Login with: `admin@digitalcoo.com`
   - You'll receive an OTP code via email
   - After OTP, you'll receive a PIN code (super admin only)

## First Login Flow

1. Enter email: `admin@digitalcoo.com`
2. Click "Send Login Code"
3. Check your email for the 6-digit OTP code
4. Enter the OTP code
5. For super admin, you'll receive a PIN code
6. Enter the PIN code to complete login

## Adding Team Members

1. Login as super admin or admin with team management permission
2. Navigate to "Team" in the navigation
3. Click "Add Member"
4. Fill in:
   - Name
   - Email
   - Role (Admin or Employee)
   - Permissions (automatically set based on role, but can be customized)
5. Click "Create"

## Permissions Explained

### Super Admin
- ✅ All permissions enabled
- ✅ Cannot be deleted or modified
- ✅ Requires PIN code for login

### Admin
- ✅ Can view payments (if enabled)
- ✅ Can view subscriptions (if enabled)
- ✅ Can manage shops (if enabled)
- ✅ Can manage team (if enabled)
- ✅ Can view docs (if enabled)

### Employee
- ❌ Cannot view payments (always disabled)
- ❌ Cannot view subscriptions (always disabled)
- ✅ Can manage shops (if enabled)
- ❌ Cannot manage team (always disabled)
- ✅ Can view docs (if enabled)

## Security Features

- **Rate Limiting**: Max 3 OTP requests per 15 minutes per email
- **OTP Expiry**: 5 minutes
- **PIN Expiry**: 5 minutes
- **Max Attempts**: 5 attempts before code is invalidated
- **JWT Tokens**: 7-day expiry
- **HTTP-only Cookies**: Prevents XSS attacks

## Data Storage

- User data is stored in `data/users.json`
- Super admin is automatically created on first run
- For production, migrate to a proper database

## Troubleshooting

### Email Not Sending
- Check `SENDGRID_API_KEY` is set correctly
- Verify sender email is verified in SendGrid
- Check SendGrid dashboard for email logs

### Login Issues
- Clear browser cookies
- Check server logs for errors
- Verify JWT_SECRET is set

### Permission Issues
- Ensure user has correct role
- Check permissions in team management
- Verify middleware is working correctly

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET` (minimum 32 characters)
3. Configure proper database (PostgreSQL/MongoDB)
4. Use Redis for OTP/PIN storage and rate limiting
5. Enable HTTPS
6. Set secure cookie flags

