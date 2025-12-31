import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { useState, useEffect } from "react";

import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  const [shop, setShop] = useState("");
  const [isValid, setIsValid] = useState(false);
  const [message, setMessage] = useState("");

  // Real-time Shopify domain validation
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
      setMessage("Looks good ✅");
    } else {
      setIsValid(false);
      if (!trimmed.includes(".myshopify.com")) {
        setMessage("Shop domain must end with '.myshopify.com'");
      } else {
        setMessage("Invalid characters or format in shop domain");
      }
    }
  }, [shop]);

  const tags = ["Price", "Collections", "Brand", "Rating", "Color", "Size", "Popularity"];
  const footerLinks = [
    { label: "Support", href: "/support" },
    { label: "Docs", href: "/docs" },
    { label: "Privacy Policy", href: "/privacy" },
  ];

  const shopifyAppUrl = "https://apps.shopify.com/advanced-filters-search";

  return (
    <div className={styles.index}>
      {/* Particle Background */}
      <svg className={styles.particles} width="100%" height="100%" viewBox="0 0 400 400">
        <circle cx="50" cy="50" r="2"/>
        <circle cx="200" cy="80" r="2"/>
        <circle cx="360" cy="40" r="2"/>
        <circle cx="50" cy="300" r="2"/>
        <circle cx="300" cy="300" r="2"/>
      </svg>

      {/* Floating Tags */}
      {tags.map((tag, i) => (
        <div
          key={i}
          className={styles.tag}
          style={{
            top: `${Math.random() * 80 + 10}%`,
            left: `${Math.random() * 80 + 10}%`,
            animationDuration: `${5 + Math.random() * 5}s`,
          }}
        >
          {tag}
        </div>
      ))}

      {/* Centered Login Card */}
      <div className={styles.card}>
        <h1 className={styles.heading}>Sign in</h1>
        <p className={styles.text}>Connect your Shopify store to continue.</p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="my-store.myshopify.com"
                value={shop}
                onChange={(e) => setShop(e.target.value)}
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
              Continue
            </button>
          </Form>
        )}

        {/* Shopify App Store Link */}
        <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "#374151" }}>
          Want to install the app?{" "}
          <a
            href={shopifyAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#dc2626", fontWeight: "600" }}
          >
            Go to Shopify App Store
          </a>
        </p>
      </div>

      {/* Footer Links */}
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
