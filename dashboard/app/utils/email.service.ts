import { SUPPORT_CONFIG } from "../config/support.config";
import { graphqlRequest } from "../graphql.server";
import sgMail from "@sendgrid/mail";
import { createModuleLogger } from "./logger";

const logger = createModuleLogger("email-service");

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
            <h2 style="margin: 0;">Support Request Received</h2>
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
  logger.info("Processing support email request", { 
    shop: ticket.shop, 
    email: ticket.email,
    subject: ticket.subject,
    priority: ticket.priority
  });

  // Send emails using SendGrid
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.APP_EMAIL_FROM;
  const fromName = process.env.APP_EMAIL_NAME;

  logger.info("SendGrid configuration check", {
    hasApiKey: !!apiKey,
    hasFromEmail: !!fromEmail,
    hasFromName: !!fromName,
    supportEmail: SUPPORT_CONFIG.contact.email
  });

  if (!apiKey || !fromEmail) {
    const error = "SendGrid not configured: Missing SENDGRID_API_KEY or APP_EMAIL_FROM";
    logger.error(error);
    throw new Error(error);
  }

  sgMail.setApiKey(apiKey);

  // Generate ticket ID first (before GraphQL call which might fail)
  const ticketId = `TICKET-${Date.now()}`;
  logger.info("Generated ticket ID", { ticketId });

  try {
    // Validate email addresses
    if (!SUPPORT_CONFIG.contact.email || !ticket.email) {
      throw new Error("Invalid email addresses");
    }

    logger.info("Sending notification to support team", { to: SUPPORT_CONFIG.contact.email });

    // Send notification to support team
    await sgMail.send({
      to: SUPPORT_CONFIG.contact.email,
      from: {
        email: fromEmail,
        name: fromName || SUPPORT_CONFIG.app.name,
      },
      subject: `[${ticket.priority.toUpperCase()}] ${ticket.subject}`,
      html: formatSupportEmailHTML(ticket),
      text: `Support Request from ${ticket.name} (${ticket.email})\n\nShop: ${ticket.shop}\nPriority: ${ticket.priority}\nSubject: ${ticket.subject}\n\nMessage:\n${ticket.message}`,
    });

    logger.info("Support team notification sent successfully");

    logger.info("Sending confirmation to customer", { to: ticket.email });

    // Send confirmation to customer
    await sgMail.send({
      to: ticket.email,
      from: {
        email: fromEmail,
        name: fromName || SUPPORT_CONFIG.app.name,
      },
      replyTo: SUPPORT_CONFIG.contact.email,
      subject: `Support Request Received - ${ticket.subject}`,
      html: formatConfirmationEmailHTML({ name: ticket.name, ticketId, subject: ticket.subject }),
      text: `Hi ${ticket.name},\n\nThank you for contacting our support team. We have received your request and will get back to you as soon as possible.\n\nYour Ticket Details:\nTicket ID: ${ticketId}\nSubject: ${ticket.subject}\n\nWe typically respond to support requests within 24 hours during business hours.\n\nBest regards,\n${SUPPORT_CONFIG.app.name} Support Team`,
    });

    logger.info("Customer confirmation sent successfully", { ticketId });

    // Try to save to database (non-critical - if this fails, emails were still sent)
    try {
      logger.info("Attempting to save ticket to database");
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

      if (result?.createSupportTicket?.id) {
        logger.info("Ticket saved to database", { dbTicketId: result.createSupportTicket.id });
      }
    } catch (dbError: any) {
      // Log but don't fail - emails were sent successfully
      logger.warn("Failed to save ticket to database (non-critical)", { error: dbError.message });
    }

  } catch (error: any) {
    const errorDetails = error?.response?.body || error?.message || error;
    logger.error("Failed to send support emails", { error: errorDetails });
    
    // Log detailed SendGrid error if available
    if (error?.response?.body?.errors) {
      logger.error("SendGrid validation errors", { errors: error.response.body.errors });
    }
    
    throw new Error(`Failed to send support emails: ${typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails)}`);
  }

  return ticketId;
}

export async function sendEmail(data: EmailData): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.APP_EMAIL_FROM;
  const fromName = process.env.APP_EMAIL_NAME;

  if (!apiKey || !fromEmail) {
    const error = "SendGrid not configured: Missing SENDGRID_API_KEY or APP_EMAIL_FROM";
    logger.error(error);
    throw new Error("Email service not configured");
  }

  sgMail.setApiKey(apiKey);

  try {
    logger.info("Sending email", { to: data.to, subject: data.subject });
    
    await sgMail.send({
      to: data.to,
      from: {
        email: data.from || fromEmail,
        name: fromName || SUPPORT_CONFIG.app.name,
      },
      subject: data.subject,
      text: data.text,
      html: data.html || data.text,
    });

    logger.info("Email sent successfully", { to: data.to });
  } catch (error: any) {
    const errorDetails = error?.response?.body || error?.message || error;
    logger.error("Failed to send email", { error: errorDetails, to: data.to });
    
    // Log detailed SendGrid error if available
    if (error?.response?.body?.errors) {
      logger.error("SendGrid validation errors", { errors: error.response.body.errors });
    }
    
    throw new Error(`Failed to send email: ${typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails)}`);
  }
}

