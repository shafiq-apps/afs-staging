/**
 * Support Page Configuration
 * 
 * Centralized configuration for the support/contact page.
 * Update these values to customize the support page content.
 */

import { CONFIG } from ".";

export const SUPPORT_CONFIG = {
  /**
   * Contact Information
   */
  contact: {
    phone: "+1 (555) 123-4567",
    email: "shafiq.solutionwin@gmail.com",
    hours: [
      "Monday - Friday: 11:00 AM - 8:00 PM EST",
      "Saturday: 11:00 AM - 7:00 PM EST",
      "Sunday: Closed",
    ],
  },

  /**
   * App Information
   */
  app: {
    name: CONFIG.app.name,
    version: CONFIG.app.version
  },

  /**
   * Documentation Links
   * Add or modify links to help resources
   */
  documentationLinks: [
    {
      title: "Getting Started Guide",
      url: "/docs/getting-started",
      description: "Learn the basics of setting up and using Advanced Filters & Search",
      icon: "🚀",
    },
    {
      title: "Filter Configuration",
      url: "/docs/filter-configuration",
      description: "Detailed guide on creating and customizing filters",
      icon: "⚙️",
    },
    {
      title: "API Documentation",
      url: "/docs/api",
      description: "Technical documentation for developers",
      icon: "📡",
    },
    {
      title: "Troubleshooting",
      url: "/docs/troubleshooting",
      description: "Common issues and their solutions",
      icon: "🔧",
    },
    {
      title: "Video Tutorials",
      url: "/docs/tutorials",
      description: "Step-by-step video guides",
      icon: "🎥",
    },
    {
      title: "FAQs",
      url: "/docs/faqs",
      description: "Frequently asked questions",
      icon: "❓",
    },
  ],

  /**
   * Form Configuration
   */
  form: {
    priorities: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "urgent", label: "Urgent" },
    ],
    defaultPriority: "medium",
    messageMaxLength: 5000,
    messageMinLength: 20,
  },

  /**
   * Response Times (for display purposes)
   */
  responseTimes: {
    low: "2-3 business days",
    medium: "24-48 hours",
    high: "12-24 hours",
    urgent: "2-4 hours",
  },

  /**
   * Success/Error Messages
   */
  messages: {
    success: "Your support request has been submitted successfully. We'll get back to you within 24 hours.",
    error: "Failed to submit support request. Please try again.",
    validationError: "Please fill in all required fields correctly.",
  },
};

/**
 * Type exports for TypeScript
 */
export type SupportConfig = typeof SUPPORT_CONFIG;
export type DocumentationLink = typeof SUPPORT_CONFIG.documentationLinks[0];
export type Priority = typeof SUPPORT_CONFIG.form.priorities[0];

