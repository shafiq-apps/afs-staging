import { t } from "app/utils/translations";

export const NAVIGATION_CONFIG = {
    PUBLIC: {
        MAIN_NAVIGATION: [
            {
                title: t("pricing.pageTitle"),
                url: "/app/pricing",
            },
            {
                title: t("support.pageTitle"),
                url: "/app/support",
            }
        ]
    },
    PRIVATE: {
        MAIN_NAVIGATION: [
            {
                title: t("home.pageTitle"),
                url: "/app",
            },
            {
                title: t("filters.pageTitle"),
                url: "/app/filters",
            },
            {
                title: t("search.pageTitle"),
                url: "/app/search",
            },
            {
                title: t("indexing.pageTitle"),
                url: "/app/indexing",
            }
        ]
    }
}
