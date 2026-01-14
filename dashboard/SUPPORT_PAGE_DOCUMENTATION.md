# Support Page Documentation

## Overview
The Support/Contact page (`app.support.tsx`) provides a comprehensive help and support interface for merchants using the Advanced Filters & Search app.

## Features

### 1. Contact Information Section
- **Phone Support**: Displays the support phone number with a clear call-to-action
- **Email Support**: Shows the support email address with expected response time
- **Support Hours**: Lists the operational hours for support availability

### 2. Documentation & Resources
Displays links to various help resources:
- Getting Started Guide
- Filter Configuration Guide
- API Documentation
- Troubleshooting Guide
- Video Tutorials
- FAQs

### 3. Support Request Form
A comprehensive form for merchants to submit support tickets with:
- **Name** (required): Merchant's full name
- **Email** (required): Contact email for responses
- **Subject** (required): Brief description of the issue
- **Priority**: Low, Medium, High, or Urgent
- **Message** (required): Detailed description of the issue

### 4. Form Validation
- Client-side validation for required fields
- Email format validation
- Error handling and user feedback
- Success confirmation messages

## Route Information
- **Route**: `/app/support`
- **File**: `dashboard/app/routes/app.support.tsx`
- **Navigation**: Added to main app navigation menu

## Customization

### Update Contact Information
Edit the `loader` function in `app.support.tsx`:

```typescript
supportInfo: {
  phone: "+1 (555) 123-4567",  // Update phone number
  email: "support@advancedfilters.com",  // Update email
  hours: [
    "Monday - Friday: 9:00 AM - 6:00 PM EST",
    "Saturday: 10:00 AM - 4:00 PM EST",
    "Sunday: Closed",
  ],
  // ... documentation links
}
```

### Update Documentation Links
Modify the `documentationLinks` array in the loader:

```typescript
documentationLinks: [
  {
    title: "Your Guide Title",
    url: "/docs/your-guide",  // Can be internal or external URL
    description: "Description of what this guide covers",
  },
  // Add more links as needed
]
```

### Implement Form Submission
Currently, the form logs submission data to the console. To implement actual functionality:

1. **Email Integration**: Add email service (SendGrid, AWS SES, etc.)
2. **Database Storage**: Store tickets in your database
3. **Ticketing System**: Integrate with services like Zendesk, Freshdesk, etc.

Example implementation in the `action` function:

```typescript
export const action = async ({ request }: ActionFunctionArgs) => {
  // ... existing validation code
  
  try {
    // 1. Send email to support team
    await sendSupportEmail({
      to: "support@yourcompany.com",
      from: email,
      subject: subject,
      body: message,
      priority: priority,
    });
    
    // 2. Store in database
    await createSupportTicket({
      shop: session?.shop,
      name,
      email,
      subject,
      priority,
      message,
    });
    
    // 3. Send confirmation to user
    await sendConfirmationEmail({
      to: email,
      ticketId: newTicket.id,
    });
    
    return {
      success: true,
      message: "Your support request has been submitted successfully.",
    };
  } catch (error) {
    // ... error handling
  }
};
```

## Styling
The page uses Shopify's custom UI components:
- `s-page`: Main page container
- `s-section`: Content sections
- `s-box`: Styled containers
- `s-grid`: Responsive grid layout
- `s-stack`: Flexbox stack layout
- `s-button`: Action buttons
- `s-banner`: Notifications/alerts
- `s-text`: Styled text elements

All styling is handled through Shopify's component system and inline styles for form inputs.

## Navigation
The support link is available in the main navigation menu:
- Added to `dashboard/app/routes/app.tsx`
- Translation key added to `dashboard/app/translations/en.json`
- Always visible (not restricted by subscription status)

## Accessibility
- Form labels properly associated with inputs
- Required fields marked with asterisks
- Clear error messages
- Loading states for form submission
- Keyboard-accessible form controls

## Future Enhancements
1. **Ticket Tracking**: Allow users to view submitted tickets and their status
2. **Live Chat**: Integrate live chat widget
3. **File Attachments**: Allow users to attach screenshots or files
4. **Knowledge Base Search**: Add search functionality for documentation
5. **Multi-language Support**: Add translations for other languages
6. **Auto-fill Shop Info**: Pre-populate form with shop information
7. **Response Time Estimation**: Show estimated response time based on priority
8. **Support Ticket History**: Display previous tickets and resolutions

## Testing
To test the support page:

1. Navigate to `/app/support` in your Remix app
2. Verify all contact information displays correctly
3. Test form validation by submitting incomplete data
4. Submit a complete form and verify success message
5. Check console logs for submission data
6. Test responsive layout on different screen sizes

## Support Data Flow
```
User fills form → Submit → Validation → Action function → 
  ├─→ Log to console (current)
  ├─→ Send email (to implement)
  ├─→ Store in database (to implement)
  └─→ Return success/error → Display message to user
```

