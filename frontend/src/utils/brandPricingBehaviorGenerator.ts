import type { SurveyFormData } from '../pages/CreateSurvey/types';
import type { QuestionModule } from '../types/questionModules';
import {
    fetchBrandPricingBehaviorModule,
    generateLayer6FromModule,
} from './brandPricingBehaviorModuleUtils';

export async function generateBrandPricingBehaviorSchema(
    formData: SurveyFormData,
    moduleDoc?: QuestionModule
) {
    const module = moduleDoc ?? await fetchBrandPricingBehaviorModule();
    const pricingCfg = formData.brand_pricing_behavior;
    return generateLayer6FromModule(
        module,
        Boolean(pricingCfg?.is_enabled),
        {
            language: formData.config?.language || 'en',
            category: pricingCfg?.target_brand || formData.config?.category || '',
            brand: pricingCfg?.target_brand || '',
        },
        pricingCfg?.selected_questions
    );
}

export function generateBrandPricingBehaviorSchemaFromModule(
    module: QuestionModule,
    formData: SurveyFormData
) {
    const pricingCfg = formData.brand_pricing_behavior;
    return generateLayer6FromModule(
        module,
        Boolean(pricingCfg?.is_enabled),
        {
            language: formData.config?.language || 'en',
            category: pricingCfg?.target_brand || formData.config?.category || '',
            brand: pricingCfg?.target_brand || '',
        },
        pricingCfg?.selected_questions
    );
}
