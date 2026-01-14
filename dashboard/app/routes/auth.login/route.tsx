import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import { t } from "app/utils/translations";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
        <s-section heading={t("auth.login.pageTitle")}>
          <s-text-field
            name="shop"
            label={t("auth.login.shopDomain")}
            details={t("auth.login.shopExample")}
            value={shop}
            onChange={(e) => setShop(e.currentTarget.value)}
            autocomplete="on"
            error={errors.shop}
            labelAccessibilityVisibility="exclusive"
          ></s-text-field>
          <s-button type="submit">{t("auth.login.submit")}</s-button>
        </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
