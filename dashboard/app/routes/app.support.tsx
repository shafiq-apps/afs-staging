import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useState } from "react";
import { SUPPORT_CONFIG } from "../config/support.config";
import { sendSupportEmail } from "../utils/email.service";
import { GraphQLError } from "../graphql.server";
import { useTranslation } from "app/utils/translations";
import { ActionData, SupportData } from "app/types";

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
  const { shop, supportInfo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    priority: SUPPORT_CONFIG.form.defaultPriority,
    message: "",
  });

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
    <s-page heading={t("support.pageTitle")} data-page-id="support">
      {/* Contact Information */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>{t("support.contactUs.title")}</s-heading>
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
                    <s-icon type="phone" size="base"/>
                    <s-heading>{t("support.contactUs.phone.title")}</s-heading>
                  </s-stack>
                  <s-stack direction="block" gap="small">
                    <s-text type="strong" tone="auto">
                      {supportInfo.phone}
                    </s-text>
                    <s-text tone="neutral">
                      {t("support.contactUs.phone.description")}
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
                    <s-icon type="email" size="base"/>
                    <s-heading>{t("support.contactUs.email.title")}</s-heading>
                  </s-stack>
                  <s-stack direction="block" gap="small">
                    <s-text type="strong" tone="auto">
                      {supportInfo.email}
                    </s-text>
                    <s-text tone="neutral">
                      {t("support.contactUs.email.description")}
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
                    <s-icon type="clock" size="base"/>
                    <s-heading>{t("support.contactUs.hours.title")}</s-heading>
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
          <s-heading>{t("support.documentation.title")}</s-heading>
          <s-text tone="neutral">
            {t("support.documentation.description")}
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
          <s-heading>{t("support.form.title")}</s-heading>
          <s-text tone="neutral">
            {t("support.form.description")}
          </s-text>

          {/* Success/Error Messages */}
          {actionData?.success && (
            <s-banner tone="success">
              <s-text>{actionData.message}</s-text>
            </s-banner>
          )}

          {actionData?.error && (
            <s-banner tone="critical">
              <s-text>{actionData.error}</s-text>
            </s-banner>
          )}
          
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
                      <s-text-field
                        label={t("support.form.name.label")}
                        required={true}
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={(e: any) => {
                          setFormData((prev) => ({ ...prev, "name": e.target.value }));
                        }}
                        disabled={isSubmitting}
                        placeholder={t("support.form.name.placeholder")}
                      />
                    </s-stack>
                  </s-grid-item>

                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text-field
                        label={t("support.form.email.label")}
                        required={true}
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={(e: any) => {
                          setFormData((prev) => ({ ...prev, "email": e.target.value }));
                        }}
                        disabled={isSubmitting}
                        placeholder={t("support.form.email.placeholder")}
                      />
                    </s-stack>
                  </s-grid-item>
                </s-grid>

                {/* Subject and Priority Row */}
                <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(250px, 1fr))">
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text-field
                        label={t("support.form.subject.label")}
                        required={true}
                        id="subject"
                        name="subject"
                        value={formData.subject}
                        onChange={(e: any) => {
                          setFormData((prev) => ({ ...prev, "subject": e.target.value }));
                        }}
                        disabled={isSubmitting}
                        placeholder={t("support.form.subject.placeholder")}
                      />
                    </s-stack>
                  </s-grid-item>

                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-select
                        label={t("support.form.priority.label")}
                        id="priority"
                        name="priority"
                        value={formData.priority}
                        onChange={(e: any) => {
                          setFormData((prev) => ({ ...prev, "priority": e.target.value }));
                        }}
                        disabled={isSubmitting}
                        placeholder={t("support.form.priority.placeholder")}
                        labelAccessibilityVisibility="visible"
                      >
                        {
                          SUPPORT_CONFIG.form.priorities.map((priority) => (
                            <s-option key={priority.value} value={priority.value}>
                              {priority.label}
                            </s-option>
                          ))
                        }
                      </s-select>
                      
                    </s-stack>
                  </s-grid-item>
                </s-grid>

                {/* Message */}
                <s-stack direction="block" gap="small">
                  <s-text-area
                    label={t("support.form.message.label")}
                    required={true}
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={(e: any) => {
                      setFormData((prev) => ({ ...prev, "message": e.target.value }));
                    }}
                    disabled={isSubmitting}
                    placeholder={t("support.form.subject.placeholder")}
                    rows={4}
                  />
                  <s-text tone="neutral">
                    {t("support.form.message.characterCount", { 
                      current: formData.message.length.toString(), 
                      max: SUPPORT_CONFIG.form.messageMaxLength.toString() 
                    })}
                    {formData.message.length < SUPPORT_CONFIG.form.messageMinLength && 
                      ` (${t("support.form.message.minWarning", { min: SUPPORT_CONFIG.form.messageMinLength.toString() })})`}
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
                    {isSubmitting ? t("support.form.submitting") : t("support.form.submit")}
                  </s-button>
                  {isSubmitting && (
                    <s-text tone="neutral">{t("support.form.pleaseWait")}</s-text>
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
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

