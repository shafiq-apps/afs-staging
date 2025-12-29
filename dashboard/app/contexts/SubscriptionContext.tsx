// app/context/SubscriptionContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import type { SubscriptionPlan } from "../types/PricingTypes";

interface SubscriptionContextState {
  subscriptionPlan: SubscriptionPlan | null;
  setSubscriptionPlan: (plan: SubscriptionPlan | null) => void;
  isSubscribed: boolean;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

const SubscriptionContext = createContext<SubscriptionContextState | undefined>(undefined);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export const SubscriptionProvider: React.FC<SubscriptionProviderProps> = ({ children }) => {
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Optionally, fetch subscription on app start
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const res = await fetch("/app/get-subscription"); // Your API to fetch current subscription
        if (res.ok) {
          const data = await res.json();
          setSubscriptionPlan(data.subscriptionPlan || null);
        }
      } catch (e) {
        console.error("Failed to fetch subscription", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSubscription();
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        subscriptionPlan,
        setSubscriptionPlan,
        isSubscribed: !!subscriptionPlan,
        loading,
        setLoading,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

// Hook to consume context
export const useSubscription = (): SubscriptionContextState => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
};
