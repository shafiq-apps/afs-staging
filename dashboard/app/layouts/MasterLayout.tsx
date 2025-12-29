import React, { useEffect } from "react";
import { useNavigate } from "react-router";
import { useSubscription } from "app/contexts/SubscriptionContext";
import { useTranslation } from "app/utils/translations";

interface MasterLayoutProps {
  children: React.ReactNode;
}

export const MasterLayout: React.FC<MasterLayoutProps> = ({ children }) => {
  const { isSubscribed, loading } = useSubscription();
  const navigate = useNavigate();
    const { t } = useTranslation();

  useEffect(() => {
    if (!loading && !isSubscribed) {
      navigate("/app/pricing", { replace: true });
    }
  }, [isSubscribed, loading, navigate]);

  if (loading) return <div>Loading...</div>;

  return (
    <>
      <header>
        {/* Navigation */}
      </header>
      <s-app-nav>
        <s-link href="/app">{t("navigation.home")}</s-link>
        <s-link href="/app/filters">{t("navigation.filters")}</s-link>
        <s-link href="/app/indexing">{t("navigation.indexing")}</s-link>
        <s-link href="/app/pricing">{t("navigation.pricing")}</s-link>
        </s-app-nav>
      <main>{children}</main>
      <footer>© 2025 My App</footer>
    </>
  );
};
