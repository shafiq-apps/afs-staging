import { CONFIG } from "app/config";
import { t } from "app/utils/translations";

export function AppFooter() {
    return (
        <s-page>
            <div style={{ marginTop: 16 }}>
                <s-box padding="large none">
                    <s-stack direction="block" gap="base">
                        <s-divider />
                        <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                            <s-stack direction="inline" columnGap="small-300">
                                <s-text>
                                    {CONFIG.app.name}
                                </s-text>
                                <s-text>•</s-text>
                                <s-text>
                                    v{CONFIG.app.version}
                                </s-text>
                            </s-stack>
                            <s-stack direction="inline" gap="base" alignItems="center" columnGap="large">
                                <s-link key={t("footer.links.link1.url")} href={t("footer.links.link1.url")} accessibilityLabel={t("footer.links.link2.label")}>
                                    <s-stack direction="inline">
                                        <s-text>{t("footer.links.link1.label")}</s-text>
                                    </s-stack>
                                </s-link>
                                <s-link key={t("footer.links.link2.label")} href={t("footer.links.link2.url")} accessibilityLabel={t("footer.links.link2.label")}>
                                    <s-stack direction="inline">
                                        <s-text>{t("footer.links.link2.label")}</s-text>
                                    </s-stack>
                                </s-link>
                                <s-link key={t("footer.links.external.link1.label")} href={t("footer.links.external.link1.url")} accessibilityLabel={t("footer.links.external.link1.label")} target="_blank">
                                    <s-stack direction="inline">
                                        <s-text>{t("footer.links.external.link1.label")}</s-text>
                                        <s-icon type="external"></s-icon>
                                    </s-stack>
                                </s-link>
                                <s-link key={t("footer.links.external.link2.label")} href={t("footer.links.external.link2.url")} accessibilityLabel={t("footer.links.external.link2.label")} target="_blank">
                                    <s-stack direction="inline">
                                        <s-text>{t("footer.links.external.link2.label")}</s-text>
                                        <s-icon type="external"></s-icon>
                                    </s-stack>
                                </s-link>
                            </s-stack>
                        </s-stack>
                    </s-stack>
                </s-box>
            </div>
        </s-page>
    );
}
