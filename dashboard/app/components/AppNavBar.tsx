import { t } from "app/utils/translations";

type AppNavBarProps = {
    hasActiveShopifySubscription: boolean;
}
 export default function AppNavBar({ hasActiveShopifySubscription }: AppNavBarProps) {
    return (
        <s-app-nav>
            {hasActiveShopifySubscription && (
                <>
                    <s-link href="/app">{t("navigation.home")}</s-link>
                    <s-link href="/app/filters">{t("navigation.filters")}</s-link>
                    <s-link href="/app/search">{t("navigation.search")}</s-link>
                    <s-link href="/app/indexing">{t("navigation.indexing")}</s-link>
                    <s-link href="/app/template">Template</s-link>
                </>
            )}
            <s-link href="/app/pricing">{t("navigation.pricing")}</s-link>
            <s-link href="/app/support">{t("navigation.support")}</s-link>
        </s-app-nav>
    )
}