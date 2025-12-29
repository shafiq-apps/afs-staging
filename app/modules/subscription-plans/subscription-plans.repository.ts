import { Client } from '@elastic/elasticsearch';
import { v4 as uuidv4 } from 'uuid';
import { SubscriptionPlan, CreatePlanInput } from './subscription-plans.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { getESClient } from '@core/elasticsearch';
import { SUBSCRIPTION_PLANS_INDEX_NAME } from '@shared/constants/es.constant';

const logger = createModuleLogger('subscription-plans-repo');


export class SubscriptionPlansRepository {
    private es: Client;

    constructor(esClient?: Client) {
        this.es = esClient || getESClient();
    }
    
    private normalize(data: any): SubscriptionPlan {
        return data as SubscriptionPlan;
    }

    async list(): Promise<SubscriptionPlan[]> {
        const res = await this.es.search({
            index: SUBSCRIPTION_PLANS_INDEX_NAME,
            size: 100,
            sort: [{ productLimit: { order: 'asc' } }],
            query: { match_all: {} },
        });

        return res.hits.hits.map(h => this.normalize(h._source));
    }

    async get(id: string): Promise<SubscriptionPlan | null> {
        try {
            const res = await this.es.get({ index: SUBSCRIPTION_PLANS_INDEX_NAME, id });
            return this.normalize(res._source);
        } catch {
            return null;
        }
    }

    async create(input: CreatePlanInput): Promise<SubscriptionPlan> {
        const now = new Date().toISOString();
        const plan: SubscriptionPlan = {
            ...input,
            id: uuidv4(),
            test: input.test ?? false,
            createdAt: now,
            updatedAt: null,
        };

        await this.es.index({
            index: SUBSCRIPTION_PLANS_INDEX_NAME,
            id: plan.id,
            document: plan,
            refresh: true,
        });

        logger.info('Plan created', { id: plan.id, handle: plan.handle });
        return plan;
    }

    async delete(id: string): Promise<boolean> {
        try {
            const re = await this.es.delete({ index: SUBSCRIPTION_PLANS_INDEX_NAME, id });
            console.log("res", re);
            return true;
        } catch {
            return false;
        }
    }
}
