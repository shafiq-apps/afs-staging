import { createContext, useContext, ReactNode } from "react";

export interface ShopLocaleData {
  ianaTimezone: string;
  timezoneAbbreviation: string;
  currencyCode: string;
  currencyFormats?: {
    moneyFormat?: string;
    moneyWithCurrencyFormat?: string;
  };
  primaryLocale?: string;
  locales?: Array<{
    locale: string;
    name: string;
    primary: boolean;
    published: boolean;
  }>;
  shopName?: string;
  myshopifyDomain?: string;
}

interface ShopContextType {
  shopData: ShopLocaleData | null;
  isLoading: boolean;
  formatDate: (date: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  formatCurrency: (amount: number, options?: Intl.NumberFormatOptions) => string;
  formatNumber: (number: number, options?: Intl.NumberFormatOptions) => string;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error("useShop must be used within a ShopProvider");
  }
  return context;
}

interface ShopProviderProps {
  children: ReactNode;
  shopData: ShopLocaleData | null;
  isLoading?: boolean;
}

export function ShopProvider({ children, shopData, isLoading = false }: ShopProviderProps) {
  // Format date using shop's timezone
  const formatDate = (
    date: Date | string | null | undefined,
    options?: Intl.DateTimeFormatOptions
  ): string => {
    if (!date) return "Never";
    
    try {
      const dateObj = typeof date === "string" ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return "Invalid date";

      const timezone = shopData?.ianaTimezone || "UTC";
      const locale = shopData?.primaryLocale || "en";

      return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        ...options,
      }).format(dateObj);
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Invalid date";
    }
  };

  // Format currency using shop's currency
  const formatCurrency = (
    amount: number,
    options?: Intl.NumberFormatOptions
  ): string => {
    const currencyCode = shopData?.currencyCode || "USD";
    const locale = shopData?.primaryLocale || "en";

    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      ...options,
    }).format(amount);
  };

  // Format number using shop's locale
  const formatNumber = (
    number: number,
    options?: Intl.NumberFormatOptions
  ): string => {
    const locale = shopData?.primaryLocale || "en";

    return new Intl.NumberFormat(locale, {
      ...options,
    }).format(number);
  };

  return (
    <ShopContext.Provider
      value={{
        shopData,
        isLoading,
        formatDate,
        formatCurrency,
        formatNumber,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

