/**
 * Support Page Configuration
 * 
 * Centralized configuration for the support/contact page.
 * Update these values to customize the support page content.
 */

import { t } from "app/utils/translations";
import { CONFIG } from ".";

export const SUPPORT_CONFIG = {
  /**
   * Contact Information
   */
  contact: {
    phone: CONFIG.phone,
    email: CONFIG.email,
    hours: [
      t("support.contactUs.hours.line1"),
      t("support.contactUs.hours.line2"),
      t("support.contactUs.hours.line3")
    ],
  },

  /**
   * App Information
   */
  app: {
    name: CONFIG.app.name,
    version: CONFIG.app.version,
  },

  /**
   * Documentation Links
   * Add or modify links to help resources
   */
  documentationLinks: [
    {
      title: t("support.documentation.links.link1.title"),
      url: t("support.documentation.links.link1.url"),
      description: t("support.documentation.links.link1.description"),
      icon: t("support.documentation.links.link1.icon"),
    },
    {
      title: t("support.documentation.links.link2.title"),
      url: t("support.documentation.links.link2.url"),
      description: t("support.documentation.links.link2.description"),
      icon: t("support.documentation.links.link2.icon"),
    },
    {
      title: t("support.documentation.links.link3.title"),
      url: t("support.documentation.links.link3.url"),
      description: t("support.documentation.links.link3.description"),
      icon: t("support.documentation.links.link3.icon"),
    },
    {
      title: t("support.documentation.links.link4.title"),
      url: t("support.documentation.links.link4.url"),
      description: t("support.documentation.links.link4.description"),
      icon: t("support.documentation.links.link4.icon"),
    },
    {
      title: t("support.documentation.links.link5.title"),
      url: t("support.documentation.links.link5.url"),
      description: t("support.documentation.links.link5.description"),
      icon: t("support.documentation.links.link5.icon"),
    }
    
  ],

  /**
   * Form Configuration
   */
  form: {
    priorities: [
      { value: "low", label: t("support.form.priority.low") },
      { value: "medium", label: t("support.form.priority.medium") },
      { value: "high", label: t("support.form.priority.high") },
      { value: "urgent", label: t("support.form.priority.urgent") },
    ],
    defaultPriority: "medium",
    messageMaxLength: 5000,
    messageMinLength: 20,
  },

  /**
   * Success/Error Messages
   */
  messages: {
    success: t("support.messages.success"),
    error: t("support.messages.error"),
    validationError: t("support.messages.validationError"),
  },
};

/**
 * Type exports for TypeScript
 */
export type SupportConfig = typeof SUPPORT_CONFIG;
export type Priority = typeof SUPPORT_CONFIG.form.priorities[0];

