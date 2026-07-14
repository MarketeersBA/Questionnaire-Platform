import { SurveyFormData } from '../pages/CreateSurvey/types';
import type { QuestionModule } from '../types/questionModules';
import {
    fetchPurchaseFunnelModule,
    generateLayer4FromModule,
} from './purchaseFunnelModuleUtils';

export async function generatePurchaseFunnelSchema(
    pfConfig: NonNullable<SurveyFormData['purchase_funnel']>,
    baseConfig: { language: 'en' | 'ar'; category: string },
    moduleDoc?: QuestionModule
) {
    const module = moduleDoc ?? await fetchPurchaseFunnelModule();
    return generateLayer4FromModule(module, pfConfig, baseConfig);
}

/** Sync helper when module doc is already loaded */
export function generatePurchaseFunnelSchemaFromModule(
    module: QuestionModule,
    pfConfig: NonNullable<SurveyFormData['purchase_funnel']>,
    baseConfig: { language: 'en' | 'ar'; category: string }
) {
    return generateLayer4FromModule(module, pfConfig, baseConfig);
}
