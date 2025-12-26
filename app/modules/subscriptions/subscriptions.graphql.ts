export const APP_SUBSCRIPTION_CREATE_MUTATION = `
    mutation AppSubscriptionCreate(
        $name: String!
        $returnUrl: URL!
        $lineItems: [AppSubscriptionLineItemInput!]!
        $trialDays: Int
        $test: Boolean
        $replacementBehavior: AppSubscriptionReplacementBehavior
    ) {
        appSubscriptionCreate(
            name: $name
            returnUrl: $returnUrl
            lineItems: $lineItems
            trialDays: $trialDays
            test: $test
            replacementBehavior: $replacementBehavior
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

export const APP_SUBSCRIPTION_STATUS_QUERY = `
    query GetAppSubscription($id: ID!) {
        appSubscription(id: $id) {
            id
            status
            name
            createdAt
            updatedAt
            lineItems {
                id
                plan {
                    pricingDetails
                }
            }
        }
    }
`;
