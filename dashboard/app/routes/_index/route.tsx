import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { useState, useEffect, useRef } from "react";

import { login, authenticate } from "../../shopify.server";
import { useTranslation } from "app/utils/translations";
import styles from "./styles.module.css";

type Tag = {
  tag: string;
  top: number;      // percentage
  left: number;     // percentage
  duration: number;
  attachedToCursor: boolean;
  topPx?: number;
  leftPx?: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // If shop parameter is present, redirect to /app
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Check if user is already authenticated
  try {
    const { session } = await authenticate.admin(request);
    if (session?.shop) {
      // User is logged in, redirect to /app
      throw redirect("/app");
    }
  } catch (authError) {
    // If it's a redirect response (authentication required), let it through
    // Otherwise, if authentication fails silently, continue to show login form
    if (authError instanceof Response) {
      // This is an authentication redirect, let it happen
      throw authError;
    }
    // If it's not a redirect, user is not authenticated - show login form
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  const [shop, setShop] = useState("");
  const [isValid, setIsValid] = useState(false);
  const [message, setMessage] = useState("");

  const [tags, setTags] = useState<Tag[]>(() =>
    [
      t("indexLanding.tags.price"),
      t("indexLanding.tags.collections"),
      t("indexLanding.tags.brand"),
      t("indexLanding.tags.rating"),
      t("indexLanding.tags.color"),
      t("indexLanding.tags.size"),
      t("indexLanding.tags.popularity"),
      t("indexLanding.tags.advancedFiltersSearch"),
      t("indexLanding.tags.digitalcoo"),
    ].map(tag => ({
      tag,
      top: Math.random() * 80 + 10,
      left: Math.random() * 80 + 10,
      duration: 5 + Math.random() * 5,
      attachedToCursor: false,
    }))
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Shopify domain validation
  useEffect(() => {
    const trimmed = shop.trim();
    if (!trimmed) {
      setIsValid(false);
      setMessage("");
      return;
    }

    const regex = /^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/i;
    if (regex.test(trimmed)) {
      setIsValid(true);
      setMessage(t("indexLanding.validation.looksGood"));
    } else {
      setIsValid(false);
      setMessage(!trimmed.includes(".myshopify.com")
        ? t("indexLanding.validation.mustEndWithMyShopify")
        : t("indexLanding.validation.invalidFormat"));
    }
  }, [shop, t]);

  // Mouse movement to attach nearest tag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Find nearest tag
      let nearestIndex = -1;
      let nearestDistance = Infinity;

      tags.forEach((item, i) => {
        const tagX = item.attachedToCursor ? item.leftPx! : (item.left / 100) * rect.width;
        const tagY = item.attachedToCursor ? item.topPx! : (item.top / 100) * rect.height;
        const dx = tagX - mouseX;
        const dy = tagY - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestIndex = i;
        }
      });

      setTags(prev => prev.map((item, i) => {
        if (i === nearestIndex && nearestDistance < 80) {
          return { ...item, attachedToCursor: true, topPx: mouseY, leftPx: mouseX };
        }
        if (item.attachedToCursor) {
          return { ...item, attachedToCursor: false, topPx: undefined, leftPx: undefined };
        }
        return item;
      }));
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [tags]);

  const footerLinks = [
    { label: t("indexLanding.footer.support"), href: "/support" },
    { label: t("indexLanding.footer.docs"), href: "/docs" },
    { label: t("indexLanding.footer.privacyPolicy"), href: "/privacy" },
  ];

  const shopifyAppUrl = "https://apps.shopify.com/advanced-filters-search";

  return (
    <div className={styles.index} ref={containerRef}>
      {/* Particle Background */}
      <svg className={styles.particles} width="100%" height="100%" viewBox="0 0 400 400">
        <circle cx="50" cy="50" r="2" />
        <circle cx="200" cy="80" r="2" />
        <circle cx="360" cy="40" r="2" />
        <circle cx="50" cy="300" r="2" />
        <circle cx="300" cy="300" r="2" />
      </svg>

      {/* Floating Tags */}
      {tags.map((item, i) => (
        <div
          key={i}
          className={`${styles.tag} ${item.attachedToCursor ? "attached" : ""}`}
          style={{
            top: item.attachedToCursor ? `${item.topPx}px` : `${item.top}%`,
            left: item.attachedToCursor ? `${item.leftPx}px` : `${item.left}%`,
            animationDuration: `${item.duration}s`,
          }}
        >
          {item.tag}
        </div>
      ))}

      {/* Login Card */}
      <div className={styles.card}>
        <h1 className={styles.heading}>{t("indexLanding.heading")}</h1>
        <p className={styles.text}>{t("indexLanding.description")}</p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>{t("indexLanding.shopDomainLabel")}</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder={t("indexLanding.shopDomainPlaceholder")}
                value={shop}
                onChange={e => setShop(e.target.value)}
                required
              />
              <span
                style={{
                  color: isValid ? "#16a34a" : "#dc2626",
                  userSelect: "none",
                  fontSize: "0.85rem",
                }}
              >
                {message}
              </span>
            </label>

            <button
              className={styles.button}
              type="submit"
              disabled={!isValid}
              style={{
                opacity: isValid ? 1 : 0.6,
                cursor: isValid ? "pointer" : "not-allowed",
              }}
            >
              {t("indexLanding.continueButton")}
            </button>
          </Form>
        )}

        <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "#374151" }}>
          {t("indexLanding.installPrompt")} {" "}
          <a
            href={shopifyAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#dc2626", fontWeight: "600" }}
          >
            {t("indexLanding.appStoreLink")}
          </a>
        </p>
      </div>

      {/* Footer */}
      <footer
        style={{
          position: "absolute",
          bottom: "1rem",
          width: "100%",
          textAlign: "center",
          zIndex: 2,
        }}
      >
        {footerLinks.map((link, i) => (
          <a
            key={i}
            href={link.href}
            style={{
              margin: "0 1rem",
              color: "#fff",
              textDecoration: "underline",
              fontSize: "0.85rem",
            }}
          >
            {link.label}
          </a>
        ))}
      </footer>
    </div>
  );
}
