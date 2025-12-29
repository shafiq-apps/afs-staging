import { graphqlRequest } from "./graphql.server";

export async function subscribePlan(params: { planId: string, shop: string }) {
    const { planId, shop } = params;
    if (!planId) {
        return "plan id requored"
    }
    const response = await graphqlRequest(`
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
        }`, { planId, shop });
    console.log("response", response);
    return response;
}