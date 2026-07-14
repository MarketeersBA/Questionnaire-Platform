import type { QuestionModule } from '../types/questionModules';
import type { SurveyFormData } from '../pages/CreateSurvey/types';
import { fetchBrandPricingBehaviorModule } from './brandPricingBehaviorModuleUtils';
import { fetchBrandUsageModule } from './brandUsageModuleUtils';
import { fetchPurchaseFunnelModule } from './purchaseFunnelModuleUtils';
import { isSurveyModuleEnabled } from '../constants/surveyModules';

export type ModuleSnapshotMap = Record<string, QuestionModule>;

/**
 * Fetch frozen module documents for every enabled configurable module at survey submit time.
 */
export async function collectModuleSnapshots(formData: SurveyFormData): Promise<ModuleSnapshotMap> {
    const snapshots: ModuleSnapshotMap = {};
    const fetches: Promise<void>[] = [];

    if (isSurveyModuleEnabled('purchase_funnel', formData)) {
        fetches.push(
            fetchPurchaseFunnelModule().then((mod) => {
                snapshots.purchase_funnel = mod;
            })
        );
    }
    if (isSurveyModuleEnabled('brand_usage', formData)) {
        fetches.push(
            fetchBrandUsageModule().then((mod) => {
                snapshots.brand_usage = mod;
            })
        );
    }
    if (isSurveyModuleEnabled('brand_pricing_behavior', formData)) {
        fetches.push(
            fetchBrandPricingBehaviorModule().then((mod) => {
                snapshots.brand_pricing_behavior = mod;
            })
        );
    }

    await Promise.all(fetches);
    return snapshots;
}
