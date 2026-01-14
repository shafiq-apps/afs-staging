import { SUPPORT_CONFIG } from "../config/support.config";
import { graphqlRequest } from "../graphql.server";

interface EmailData {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
}

interface SupportTicket {
  name: string;
  email: string;
  shop: string;
  subject: string;
  priority: string;
  message: string;
}

const priorityColors: Record<string, string> = {
  low: "#6b7280",
  medium: "#3b82f6",
  high: "#f59e0b",
  urgent: "#ef4444",
};

export function formatSupportEmailHTML(ticket: SupportTicket): string {
  const priorityColor = priorityColors[ticket.priority] || "#3b82f6";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background-color: #f8f9fa; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; }
          .priority-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; color: white; font-size: 12px; font-weight: bold; background-color: ${priorityColor}; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; }
          .value { margin-top: 4px; }
          .message-box { background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin-top: 10px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">🎫 New Support Request</h2>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">Priority</div>
              <div class="value">
                <span class="priority-badge">${ticket.priority.toUpperCase()}</span>
              </div>
            </div>
            
            <div class="field">
              <div class="label">Subject</div>
              <div class="value">${ticket.subject}</div>
            </div>
            
            <div class="field">
              <div class="label">From</div>
              <div class="value">
                <strong>${ticket.name}</strong><br>
                Email: <a href="mailto:${ticket.email}">${ticket.email}</a><br>
                Shop: ${ticket.shop}
              </div>
            </div>
            
            <div class="field">
              <div class="label">Message</div>
              <div class="message-box">${ticket.message}</div>
            </div>
            
            <div class="field">
              <div class="label">Submitted</div>
              <div class="value">${new Date().toLocaleString()}</div>
            </div>
          </div>
          <div class="footer">
            This is an automated message from ${SUPPORT_CONFIG.app.name} support system.
          </div>
        </div>
      </body>
    </html>
  `;
}

export function formatConfirmationEmailHTML(data: {
  name: string;
  ticketId: string;
  subject: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background-color: #f8f9fa; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; }
          .ticket-id { background-color: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 14px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">✅ Support Request Received</h2>
          </div>
          <div class="content">
            <p>Hi ${data.name},</p>
            <p>Thank you for contacting our support team. We have received your request and will get back to you as soon as possible.</p>
            
            <p><strong>Your Ticket Details:</strong></p>
            <div class="ticket-id">
              Ticket ID: ${data.ticketId}<br>
              Subject: ${data.subject}
            </div>
            
            <p>We typically respond to support requests within 24 hours during business hours.</p>
            
            <p>If you need to add any additional information, please reply to this email with your ticket ID.</p>
            
            <p>Best regards,<br>
            ${SUPPORT_CONFIG.app.name} Support Team</p>
          </div>
          <div class="footer">
            This is an automated confirmation email.
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function sendSupportEmail(ticket: SupportTicket): Promise<string> {
  const mutation = `
    mutation CreateSupportTicket($input: CreateSupportTicketInput!) {
      createSupportTicket(input: $input) {
        id
        shop
        name
        email
        subject
        priority
        message
        status
        createdAt
      }
    }
  `;

  const result = await graphqlRequest(mutation, {
    input: {
      shop: ticket.shop,
      name: ticket.name,
      email: ticket.email,
      subject: ticket.subject,
      priority: ticket.priority,
      message: ticket.message,
    },
  });

  const createdTicket = result?.createSupportTicket;
  const ticketId = createdTicket?.id || `TICKET-${Date.now()}`;

  // TODO: Implement email sending
  // When you have an email service configured, uncomment one of these:
  
  // Option 1: SendGrid
  /*
  const sgMail = require("@sendgrid/mail");
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  
  await sgMail.send({
    to: SUPPORT_CONFIG.contact.email,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: `[${ticket.priority.toUpperCase()}] ${ticket.subject}`,
    html: formatSupportEmailHTML(ticket),
  });
  
  await sgMail.send({
    to: ticket.email,
    from: SUPPORT_CONFIG.contact.email,
    subject: `Support Request Received - ${ticket.subject}`,
    html: formatConfirmationEmailHTML({ name: ticket.name, ticketId, subject: ticket.subject }),
  });
  */
  
  // Option 2: Resend
  /*
  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: SUPPORT_CONFIG.contact.email,
    subject: `[${ticket.priority.toUpperCase()}] ${ticket.subject}`,
    html: formatSupportEmailHTML(ticket),
  });
  
  await resend.emails.send({
    from: SUPPORT_CONFIG.contact.email,
    to: ticket.email,
    subject: `Support Request Received - ${ticket.subject}`,
    html: formatConfirmationEmailHTML({ name: ticket.name, ticketId, subject: ticket.subject }),
  });
  */

  console.log("Support ticket created:", ticketId);
  return ticketId;
}

export async function sendEmail(data: EmailData): Promise<void> {
  // Generic email sending function
  // Configure based on your email service provider
  console.log("Email would be sent:", data);
}

