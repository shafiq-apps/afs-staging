import { NAVIGATION_CONFIG } from "app/config/navigations.config";

type AppNavBarProps = {
    hasActiveShopifySubscription: boolean;
}
export default function AppNavBar({ hasActiveShopifySubscription }: AppNavBarProps) {
    return (
        <s-app-nav>
            {
                hasActiveShopifySubscription ? NAVIGATION_CONFIG.PRIVATE.MAIN_NAVIGATION.map((navItem) => (
                    <s-link key={navItem.url} href={navItem.url}>{navItem.title}</s-link>
                )): null
            }
            {
                NAVIGATION_CONFIG.PUBLIC.MAIN_NAVIGATION.map((navItem) => (
                    <s-link key={navItem.url} href={navItem.url}>{navItem.title}</s-link>
                ))
            }
        </s-app-nav>
    )
}