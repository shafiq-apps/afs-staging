export const FETCH_BILLING_PLANS_AND_SUBSCRIPTION = `
    query {
        subscriptionPlans {
            id
            name
            handle
            description
            productLimit
            price {
                amount
                currencyCode
            }
            interval
        }
        subscription {
            id
            name
            test
            status
        }
    }
`;

export const FETCH_CURRENT_SUBSCRIPTION = `
    query {
        subscription {
            id
            name
            test
            status
        }
    }
`;