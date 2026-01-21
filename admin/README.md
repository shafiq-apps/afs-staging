# DigitalCoo Admin Panel

A secure, centralized admin panel built with Next.js, TypeScript, and Tailwind CSS for managing DigitalCoo operations.

## Features

- 🔐 **Secure Authentication**: Email-based OTP login system (no passwords)
- 🔑 **Super Admin PIN**: Additional PIN code required for super admin accounts
- 👥 **Team Management**: Add team members with role-based permissions
- 🛡️ **Permission System**: Granular permissions for different user roles
- 📱 **Mobile Responsive**: Fully responsive design
- 🎨 **Modern UI**: Clean, professional interface with Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- SendGrid API key (for email functionality)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
Create a `.env.local` file in the `admin` directory:

```env
SENDGRID_API_KEY=your_sendgrid_api_key
APP_EMAIL_FROM=noreply@digitalcoo.com
APP_EMAIL_NAME=DigitalCoo Admin
JWT_SECRET=your-super-secret-jwt-key-change-in-production
NODE_ENV=development
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Default Super Admin Account

- **Email**: `admin@digitalcoo.com`
- **Login**: Use email + OTP + PIN code

The super admin account is automatically created on first run.

## User Roles

### Super Admin
- Full access to all features
- Can manage team members
- Requires PIN code for login
- Cannot be deleted or modified

### Admin
- Can view payments and subscriptions
- Can manage shops
- Can manage team (if permission granted)
- Cannot access super admin features

### Employee
- Limited access
- Cannot view payments or subscriptions
- Can manage shops (if permission granted)
- Cannot manage team

## Security Features

- **Rate Limiting**: Prevents brute force attacks
- **OTP Expiry**: OTP codes expire after 5 minutes
- **PIN Expiry**: PIN codes expire after 5 minutes
- **JWT Tokens**: Secure session management
- **HTTP-only Cookies**: Prevents XSS attacks
- **Permission Checks**: All routes protected by permissions

## Project Structure

```
admin/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── auth/          # Authentication API routes
│   │   ├── dashboard/         # Dashboard page
│   │   ├── team/              # Team management page
│   │   ├── login/             # Login page
│   │   └── layout.tsx         # Root layout
│   ├── components/
│   │   ├── auth/              # Authentication components
│   │   └── layout/            # Layout components
│   ├── lib/
│   │   ├── auth.utils.ts      # OTP/PIN utilities
│   │   ├── email.service.ts   # Email service
│   │   ├── jwt.utils.ts       # JWT utilities
│   │   ├── rate-limit.ts      # Rate limiting
│   │   └── user.storage.ts    # User storage
│   └── types/
│       └── auth.ts             # TypeScript types
├── data/                       # User data (auto-created)
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/send-otp` - Send OTP code to email
- `POST /api/auth/verify-otp` - Verify OTP code
- `POST /api/auth/send-pin` - Send PIN code (super admin)
- `POST /api/auth/verify-pin` - Verify PIN code
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Team Management
- `GET /api/team` - Get all team members
- `POST /api/team` - Create new team member
- `GET /api/team/[id]` - Get team member by ID
- `PATCH /api/team/[id]` - Update team member
- `DELETE /api/team/[id]` - Delete team member

## Development

### Build for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Notes

- User data is stored in `data/users.json` (JSON file storage)
- For production, consider migrating to a proper database (PostgreSQL, MongoDB, etc.)
- Rate limiting is in-memory; use Redis for production
- OTP/PIN storage is in-memory; use Redis for production

## Future Enhancements

- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] Redis for session/OTP storage
- [ ] Audit logging
- [ ] Two-factor authentication
- [ ] Password reset functionality
- [ ] Activity logs
- [ ] Advanced analytics dashboard
