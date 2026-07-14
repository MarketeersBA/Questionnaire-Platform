import type { SurveyFormData } from '../pages/CreateSurvey/types';
import type { QuestionModule } from '../types/questionModules';
import {
    fetchBrandUsageModule,
    generateLayer5FromModule,
} from './brandUsageModuleUtils';

export async function generateBrandUsageSchema(
    formData: SurveyFormData,
    moduleDoc?: QuestionModule
) {
    const module = moduleDoc ?? await fetchBrandUsageModule();
    const usageCfg = formData.brand_usage;
    return generateLayer5FromModule(
        module,
        Boolean(usageCfg?.is_enabled),
        {
            language: formData.config?.language || 'en',
            category: usageCfg?.target_brand || formData.config?.category || '',
            brand: usageCfg?.target_brand || '',
        },
        usageCfg?.selected_questions
    );
}

export function generateBrandUsageSchemaFromModule(
    module: QuestionModule,
    formData: SurveyFormData
) {
    const usageCfg = formData.brand_usage;
    return generateLayer5FromModule(
        module,
        Boolean(usageCfg?.is_enabled),
        {
            language: formData.config?.language || 'en',
            category: usageCfg?.target_brand || formData.config?.category || '',
            brand: usageCfg?.target_brand || '',
        },
        usageCfg?.selected_questions
    );
}
