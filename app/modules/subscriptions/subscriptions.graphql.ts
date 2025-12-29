export const APP_SUBSCRIPTION_CREATE_MUTATION = `
    mutation AppSubscriptionCreate(
        $name: String!
        $returnUrl: URL!
        $lineItems: [AppSubscriptionLineItemInput!]!
        $trialDays: Int
        $test: Boolean
    ) {
        appSubscriptionCreate(
            name: $name
            returnUrl: $returnUrl
            lineItems: $lineItems
            trialDays: $trialDays
            test: $test
        ) {
            userErrors {
                field
                message
            }
            appSubscription {
                id
                name
                status
                createdAt
                lineItems {
                    id
                    plan {
                        pricingDetails
                    }
                }
            }
            confirmationUrl
        }
    }
`;

export const APP_SUBSCRIPTION_QUERY = `
    query AppSubscriptionById($shopifySubscriptionId: ID!) {
        node(id: $shopifySubscriptionId) {
            ... on AppSubscription {
                id
                name
                status
                test
                createdAt
                lineItems {
                    id
                    plan {
                        pricingDetails {
                            __typename
                            ... on AppRecurringPricing {
                                interval
                                price {
                                    amount
                                    currencyCode
                                }
                            }
                            ... on AppUsagePricing {
                                terms
                                cappedAmount {
                                    amount
                                    currencyCode
                                }
                                balanceUsed {
                                    amount
                                    currencyCode
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;