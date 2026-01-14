import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useActionData, useLoaderData, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useState } from "react";
import { SUPPORT_CONFIG } from "../config/support.config";
import { sendSupportEmail } from "../utils/email.service";
import { GraphQLError } from "../graphql.server";

interface SupportData {
  shop?: string;
  appName: string;
  appVersion: string;
  supportInfo: {
    phone: string;
    email: string;
    hours: string[];
    documentationLinks: {
      title: string;
      url: string;
      description: string;
    }[];
  };
}

interface ActionData {
  success?: boolean;
  error?: string;
  message?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  return {
    shop,
    appName: SUPPORT_CONFIG.app.name,
    appVersion: SUPPORT_CONFIG.app.version,
    supportInfo: {
      phone: SUPPORT_CONFIG.contact.phone,
      email: SUPPORT_CONFIG.contact.email,
      hours: SUPPORT_CONFIG.contact.hours,
      documentationLinks: SUPPORT_CONFIG.documentationLinks,
    },
  } as SupportData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const subject = formData.get("subject") as string;
  const priority = formData.get("priority") as string;
  const message = formData.get("message") as string;

  // Validation
  if (!name || !email || !subject || !message) {
    return {
      success: false,
      error: SUPPORT_CONFIG.messages.validationError,
    } as ActionData;
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      success: false,
      error: "Please provide a valid email address",
    } as ActionData;
  }

  // Message length validation
  if (message.length < SUPPORT_CONFIG.form.messageMinLength) {
    return {
      success: false,
      error: `Message must be at least ${SUPPORT_CONFIG.form.messageMinLength} characters long`,
    } as ActionData;
  }

  if (message.length > SUPPORT_CONFIG.form.messageMaxLength) {
    return {
      success: false,
      error: `Message must not exceed ${SUPPORT_CONFIG.form.messageMaxLength} characters`,
    } as ActionData;
  }

  try {
    await sendSupportEmail({
      shop: session?.shop || "",
      name,
      email,
      subject,
      priority,
      message,
    });

    return {
      success: true,
      message: SUPPORT_CONFIG.messages.success,
    } as ActionData;
  } catch (error: any) {
    // Check if it's a server/network error
    if (error instanceof GraphQLError && (error.isServerError || error.isNetworkError)) {
      // Return a specific error message for server downtime
      return {
        success: false,
        error: "Our support system is currently unavailable. Please try again later or email us directly at " + SUPPORT_CONFIG.contact.email,
      } as ActionData;
    }
    
    return {
      success: false,
      error: error.message || SUPPORT_CONFIG.messages.error,
    } as ActionData;
  }
};

export default function Support() {
  const { shop, appName, appVersion, supportInfo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    priority: SUPPORT_CONFIG.form.defaultPriority,
    message: "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Reset form on successful submission
  if (actionData?.success && !isSubmitting) {
    setTimeout(() => {
      setFormData({
        name: "",
        email: "",
        subject: "",
        priority: SUPPORT_CONFIG.form.defaultPriority,
        message: "",
      });
    }, 100);
  }

  return (
    <s-page heading="Contact Support" data-page-id="support">
      {/* Success/Error Messages */}
      {actionData?.success && (
        <s-section>
          <s-banner tone="success">
            <s-text>{actionData.message}</s-text>
          </s-banner>
        </s-section>
      )}

      {actionData?.error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>{actionData.error}</s-text>
          </s-banner>
        </s-section>
      )}

      {/* Contact Information */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Get in Touch</s-heading>
          <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))">
            {/* Phone */}
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <div style={{ fontSize: "24px" }}>📞</div>
                    <s-heading>Phone Support</s-heading>
                  </s-stack>
                  <s-stack direction="block" gap="small">
                    <s-text type="strong" tone="auto">
                      {supportInfo.phone}
                    </s-text>
                    <s-text tone="neutral">
                      Call us for immediate assistance with urgent issues
                    </s-text>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-grid-item>

            {/* Email */}
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <div style={{ fontSize: "24px" }}>✉️</div>
                    <s-heading>Email Support</s-heading>
                  </s-stack>
                  <s-stack direction="block" gap="small">
                    <s-text type="strong" tone="auto">
                      {supportInfo.email}
                    </s-text>
                    <s-text tone="neutral">
                      Send us an email and we'll respond within 24 hours
                    </s-text>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-grid-item>

            {/* Support Hours */}
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <div style={{ fontSize: "24px" }}>🕒</div>
                    <s-heading>Support Hours</s-heading>
                  </s-stack>
                  <s-stack direction="block" gap="small">
                    {supportInfo.hours.map((hour, index) => (
                      <s-text key={index} tone="auto">
                        {hour}
                      </s-text>
                    ))}
                  </s-stack>
                </s-stack>
              </s-box>
            </s-grid-item>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Documentation Links */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Documentation & Resources</s-heading>
          <s-text tone="neutral">
            Browse our comprehensive documentation to find answers to common questions
          </s-text>
          <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(300px, 1fr))">
            {supportInfo.documentationLinks.map((link, index) => (
              <s-grid-item key={index}>
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="base"
                >
                  <s-stack direction="block" gap="small">
                    <s-link href={link.url}>
                      <s-text type="strong">{link.title}</s-text>
                    </s-link>
                    <s-text tone="neutral">{link.description}</s-text>
                  </s-stack>
                </s-box>
              </s-grid-item>
            ))}
          </s-grid>
        </s-stack>
      </s-section>

      {/* Support Form */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Submit a Support Request</s-heading>
          <s-text tone="neutral">
            Fill out the form below and our support team will get back to you as soon as possible
          </s-text>
          
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="base"
          >
            <Form method="post">
              <s-stack direction="block" gap="base">
                {/* Name and Email Row */}
                <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(250px, 1fr))">
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <label htmlFor="name">
                        <s-text type="strong">
                          Name <span style={{ color: "red" }}>*</span>
                        </s-text>
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        disabled={isSubmitting}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          border: "1px solid #c9cccf",
                          fontSize: "14px",
                        }}
                        placeholder="Your full name"
                      />
                    </s-stack>
                  </s-grid-item>

                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <label htmlFor="email">
                        <s-text type="strong">
                          Email <span style={{ color: "red" }}>*</span>
                        </s-text>
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                        disabled={isSubmitting}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          border: "1px solid #c9cccf",
                          fontSize: "14px",
                        }}
                        placeholder="your.email@example.com"
                      />
                    </s-stack>
                  </s-grid-item>
                </s-grid>

                {/* Subject and Priority Row */}
                <s-grid gap="base" gridTemplateColumns="2fr 1fr">
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <label htmlFor="subject">
                        <s-text type="strong">
                          Subject <span style={{ color: "red" }}>*</span>
                        </s-text>
                      </label>
                      <input
                        type="text"
                        id="subject"
                        name="subject"
                        value={formData.subject}
                        onChange={handleInputChange}
                        required
                        disabled={isSubmitting}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          border: "1px solid #c9cccf",
                          fontSize: "14px",
                        }}
                        placeholder="Brief description of your issue"
                      />
                    </s-stack>
                  </s-grid-item>

                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <label htmlFor="priority">
                        <s-text type="strong">Priority</s-text>
                      </label>
                      <select
                        id="priority"
                        name="priority"
                        value={formData.priority}
                        onChange={handleInputChange}
                        disabled={isSubmitting}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          border: "1px solid #c9cccf",
                          fontSize: "14px",
                          backgroundColor: "white",
                        }}
                      >
                        {SUPPORT_CONFIG.form.priorities.map((priority) => (
                          <option key={priority.value} value={priority.value}>
                            {priority.label}
                          </option>
                        ))}
                      </select>
                    </s-stack>
                  </s-grid-item>
                </s-grid>

                {/* Message */}
                <s-stack direction="block" gap="small">
                  <label htmlFor="message">
                    <s-text type="strong">
                      Message <span style={{ color: "red" }}>*</span>
                    </s-text>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    required
                    disabled={isSubmitting}
                    rows={8}
                    minLength={SUPPORT_CONFIG.form.messageMinLength}
                    maxLength={SUPPORT_CONFIG.form.messageMaxLength}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "4px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                    placeholder="Please describe your issue in detail. Include any error messages, steps to reproduce, and relevant screenshots."
                  />
                  <s-text tone="neutral">
                    {formData.message.length} / {SUPPORT_CONFIG.form.messageMaxLength} characters
                    {formData.message.length < SUPPORT_CONFIG.form.messageMinLength && 
                      ` (minimum ${SUPPORT_CONFIG.form.messageMinLength} characters)`}
                  </s-text>
                </s-stack>

                {/* Shop Info (Hidden) */}
                <input type="hidden" name="shop" value={shop} />

                {/* Submit Button */}
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-button
                    type="submit"
                    variant="primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Submitting..." : "Submit Support Request"}
                  </s-button>
                  {isSubmitting && (
                    <s-text tone="neutral">Please wait...</s-text>
                  )}
                </s-stack>
              </s-stack>
            </Form>
          </s-box>
        </s-stack>
      </s-section>

      {/* Additional Help */}
      <s-section>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="base"
        >
          <s-stack direction="block" gap="base">
            <s-heading>Additional Help</s-heading>
            <s-stack direction="block" gap="small">
              <s-text tone="auto">
                <s-text type="strong">Before submitting a ticket:</s-text>
              </s-text>
              <s-unordered-list>
                <s-list-item>
                  <s-text tone="auto">
                    Check our <s-link href="/docs/faqs">FAQs</s-link> for quick answers
                  </s-text>
                </s-list-item>
                <s-list-item>
                  <s-text tone="auto">
                    Review our <s-link href="/docs/troubleshooting">Troubleshooting Guide</s-link>
                  </s-text>
                </s-list-item>
                <s-list-item>
                  <s-text tone="auto">
                    Watch our <s-link href="/docs/tutorials">Video Tutorials</s-link>
                  </s-text>
                </s-list-item>
              </s-unordered-list>
            </s-stack>
            <s-divider />
            <s-text tone="neutral">
              {appName} v{appVersion} • Shop: {shop}
            </s-text>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

