import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { useState, useEffect, useRef } from "react";

import { login } from "../../shopify.server";
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

  const [tags, setTags] = useState<Tag[]>(() =>
    ["Price","Collections","Brand","Rating","Color","Size","Popularity","Advanced Filters & Search","Digitalcoo"]
      .map(tag => ({
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
    if (!trimmed) { setIsValid(false); setMessage(""); return; }
    const regex = /^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/i;
    if (regex.test(trimmed)) {
      setIsValid(true); setMessage("Looks good ✅");
    } else {
      setIsValid(false);
      setMessage(!trimmed.includes(".myshopify.com")
        ? "Shop domain must end with '.myshopify.com'"
        : "Invalid characters or format in shop domain");
    }
  }, [shop]);

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

      tags.forEach((t, i) => {
        const tagX = t.attachedToCursor ? t.leftPx! : (t.left / 100) * rect.width;
        const tagY = t.attachedToCursor ? t.topPx! : (t.top / 100) * rect.height;
        const dx = tagX - mouseX;
        const dy = tagY - mouseY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < nearestDistance) { nearestDistance = dist; nearestIndex = i; }
      });

      setTags(prev => prev.map((t, i) => {
        if (i === nearestIndex && nearestDistance < 80) { // attach
          return { ...t, attachedToCursor: true, topPx: mouseY, leftPx: mouseX };
        } else if (t.attachedToCursor) { // release
          return { ...t, attachedToCursor: false, topPx: undefined, leftPx: undefined };
        } else {
          return t;
        }
      }));
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [tags]);

  const footerLinks = [
    { label: "Support", href: "/support" },
    { label: "Docs", href: "/docs" },
    { label: "Privacy Policy", href: "/privacy" },
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
      {tags.map((t, i) => (
        <div
          key={i}
          className={`${styles.tag} ${t.attachedToCursor ? "attached" : ""}`}
          style={{
            top: t.attachedToCursor ? `${t.topPx}px` : `${t.top}%`,
            left: t.attachedToCursor ? `${t.leftPx}px` : `${t.left}%`,
            animationDuration: `${t.duration}s`,
          }}
        >
          {t.tag}
        </div>
      ))}

      {/* Login Card */}
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
              Continue
            </button>
          </Form>
        )}

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
