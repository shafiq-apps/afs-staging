import type { HeadersFunction, LoaderFunctionArgs} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useTranslation } from "app/utils/translations";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    await authenticate.admin(request);
};

export default function CreateFilterPage() {
  const { t } = useTranslation();
  
  return (
    <s-page heading={t("templates.pageTitle")}>
        <s-heading>{t("templates.pageTitle")}</s-heading>
    </s-page>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
