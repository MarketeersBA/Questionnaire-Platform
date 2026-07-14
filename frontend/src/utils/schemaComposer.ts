import { SurveyFormData } from '../pages/CreateSurvey/types';
import { generateTasteTestModuleSchema } from './tasteTestGenerator';
import { generateProductTestModuleSchema } from './productTestGenerator';
import { generatePurchaseFunnelSchema } from './purchaseFunnelGenerator';
import { generateBrandUsageSchema } from './brandUsageGenerator';
import { generateBrandPricingBehaviorSchema } from './brandPricingBehaviorGenerator';
import { resolveModuleSequence } from '../constants/surveyModules';
import { extractTasteTestModuleMeta } from './tasteTestModuleUtils';

import { generateBrandAnalyzerSchema } from './brandAnalyzerGenerator';
import { resolveBrandContextFromFormConfig } from './productTestPlaceholderEngine';
import { normalizeTrialMediaCapture } from './trialMediaCaptureConfig';

export async function composeSurveySchema(
    formData: SurveyFormData,
    masterData: Record<string, any[]>
) {
    const sequence = resolveModuleSequence(formData);
    const results: any = {
        layer1_structure: { sections: [] },
        layer2_structure: { sections: [] },
        layer3_structure: { sections: [] },
        layer4_structure: { sections: [] },
        layer5_structure: { sections: [] },
        layer6_structure: { sections: [] },
        layer7_structure: { sections: [] },
        product_test_snapshot: null,
    };

    const baseConfig = {
        language: (formData.config?.language || formData.product_test_config?.language || 'en') as 'en' | 'ar',
        category: formData.config?.category || '',
    };

    const pfActive = Boolean(formData.purchase_funnel?.is_enabled);

    for (const module of sequence) {
        if (module === 'taste_test' && formData.config) {
            const tasteModuleMeta = extractTasteTestModuleMeta(masterData);
            const tasteSchema = generateTasteTestModuleSchema(
                formData.config,
                masterData,
                tasteModuleMeta,
            );
            results.layer1_structure.sections.push(...tasteSchema.layer1_structure.sections);
            results.layer2_structure.sections.push(...tasteSchema.layer2_structure.sections);
        }

        if (module === 'product_test') {
            const productQuestions = masterData.product_test_questions || [];
            const packageQuestions = masterData.package_test_questions || [];

            // Use explicit config if set, otherwise build a default. 
            // In either case, ensure fixed_questions array contains at least the actual fixed questions from masterData
            const staticFixedIds = productQuestions
                .filter((q: any) => q.question_status === 'fixed')
                .map((q: any) => q.question_id);

            const userConfig = formData.product_test_config;
            const ptConfig = {
                version: userConfig?.version || 1,
                language: userConfig?.language || baseConfig.language,
                selected_attributes: userConfig?.selected_attributes || [],
                fixed_questions: (userConfig?.fixed_questions?.length) ? userConfig.fixed_questions : staticFixedIds,
                optional_questions: userConfig?.optional_questions || [],
                package_test_enabled: userConfig?.package_test_enabled || false,
                package_test_attributes: userConfig?.package_test_attributes || [],
                packaging_heatmap_enabled: userConfig?.packaging_heatmap_enabled || false,
                packaging_heatmap_images: userConfig?.packaging_heatmap_images || { front: null, back: null },
                trial_media_capture: normalizeTrialMediaCapture(userConfig?.trial_media_capture),
                status: userConfig?.status || 'draft',
            };
            const ptSchema = generateProductTestModuleSchema(
                ptConfig,
                productQuestions,
                packageQuestions,
                resolveBrandContextFromFormConfig(formData.config),
            );
            results.layer1_structure.sections.push(...ptSchema.layer1_structure.sections);
            results.product_test_snapshot = ptSchema.product_test_snapshot;
        }

        if (module === 'purchase_funnel' && formData.purchase_funnel?.is_enabled) {
            const pfSchema = await generatePurchaseFunnelSchema(formData.purchase_funnel, baseConfig);
            results.layer4_structure.sections.push(...pfSchema.sections);
        }

        if (module === 'brand_usage' && formData.brand_usage?.is_enabled) {
            const usageSchema = await generateBrandUsageSchema(formData);
            results.layer5_structure.sections.push(...usageSchema.sections);
        }

        if (module === 'brand_pricing_behavior' && formData.brand_pricing_behavior?.is_enabled) {
            const pricingSchema = await generateBrandPricingBehaviorSchema(formData);
            results.layer6_structure.sections.push(...pricingSchema.sections);
        }

        if (module === 'brand_analyzer') {
            const baConfig = formData.brand_analyzer;
            if (baConfig?.is_enabled) {
                const baSchema = await generateBrandAnalyzerSchema(baConfig, baseConfig, pfActive);
                results.layer7_structure.sections.push(...baSchema.sections);
            }
        }
    }

    return results;
}
