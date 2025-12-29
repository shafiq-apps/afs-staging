export const UPDATE_SUBSCRIPTION_STATUS_MUTATION = `
    mutation UpdateSubscriptionStatus($id: String!) {
        updateSubscriptionStatus(
            id: $id
        ) {
            id
            status
            updatedAt
        }
    }
`;

export const CREATE_APP_SUBSCRIPTION_MUTATION = `
    mutation AppSubscriptionCreate(
        $planId: String!
        ){
        appSubscriptionCreate(
            planId: $planId
        ) {
            confirmationUrl
            userErrors {
            field
            message
            }
        }
    }
`;