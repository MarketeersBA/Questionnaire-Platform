import type { SurveyFormData } from '../pages/CreateSurvey/types';

/** Default ordered list of all research modules in the survey journey. */
export const DEFAULT_MODULE_SEQUENCE = [
    'screening',
    'taste_test',
    'product_test',
    'purchase_funnel',
    'brand_usage',
    'brand_pricing_behavior',
    'brand_analyzer',
] as const;

export type ConfigurableModuleId =
    | 'purchase_funnel'
    | 'brand_usage'
    | 'brand_pricing_behavior'
    | 'brand_analyzer';

export interface SurveyModuleMeta {
    id: string;
    label: string;
    schemaLayer?: keyof SurveyFormData['schema'];
    description?: string;
}

export const SURVEY_MODULE_REGISTRY: Record<string, SurveyModuleMeta> = {
    screening: {
        id: 'screening',
        label: 'Respondent Screening',
    },
    taste_test: {
        id: 'taste_test',
        label: 'Product Taste Test (Loop)',
    },
    product_test: {
        id: 'product_test',
        label: 'Product Test Module',
    },
    purchase_funnel: {
        id: 'purchase_funnel',
        label: 'Purchase Funnel Module',
        schemaLayer: 'layer4_structure',
        description: 'Brand awareness, consideration & purchase tracking',
    },
    brand_usage: {
        id: 'brand_usage',
        label: 'Brand Usage Module',
        schemaLayer: 'layer5_structure',
        description: 'Recency, frequency, timing & occasion habits',
    },
    brand_pricing_behavior: {
        id: 'brand_pricing_behavior',
        label: 'Purchase Behaviour Module',
        schemaLayer: 'layer6_structure',
        description: 'Budget, stocking, channels & pack sizes',
    },
    brand_analyzer: {
        id: 'brand_analyzer',
        label: 'Brand Analyzer Module',
        schemaLayer: 'layer7_structure',
        description: 'Brand equity, perceptions grid & satisfaction loop',
    },
};

export function resolveModuleSequence(formData: SurveyFormData): string[] {
    const raw =
        formData.module_sequence
        || formData.config?.module_sequence
        || [...DEFAULT_MODULE_SEQUENCE];

    // Ensure the core evaluation module for this survey type is present in the sequence.
    // Without this, a product_test survey using a taste_test-default sequence would
    // never trigger the product_test composer branch.
    const coreModule = formData.survey_type === 'product_test' ? 'product_test' : 'taste_test';
    if (!raw.includes(coreModule)) {
        // Insert right after 'screening' (position 1) or at the front
        const idx = raw.indexOf('screening');
        const insertAt = idx >= 0 ? idx + 1 : 0;
        const seq = [...raw];
        seq.splice(insertAt, 0, coreModule);
        return seq;
    }
    return [...raw];
}

export function isSurveyModuleEnabled(modId: string, formData: SurveyFormData): boolean {
    switch (modId) {
        case 'screening':
            return true;
        case 'taste_test':
            return formData.survey_type === 'taste_test'
                || (formData.config?.module_sequence || []).includes('taste_test');
        case 'product_test':
            return formData.survey_type === 'product_test'
                || (formData.config?.module_sequence || formData.module_sequence || []).includes('product_test');
        case 'purchase_funnel':
            return Boolean(formData.purchase_funnel?.is_enabled);
        case 'brand_usage':
            return Boolean(formData.brand_usage?.is_enabled);
        case 'brand_pricing_behavior':
            return Boolean(formData.brand_pricing_behavior?.is_enabled);
        case 'brand_analyzer':
            return Boolean(formData.brand_analyzer?.is_enabled);
        default:
            return false;
    }
}

export function buildSelectedModules(formData: SurveyFormData): string[] {
    const mods = ['screening'];
    if (isSurveyModuleEnabled('taste_test', formData)) mods.push('taste_test');
    if (isSurveyModuleEnabled('product_test', formData)) mods.push('product_test');
    if (isSurveyModuleEnabled('purchase_funnel', formData)) mods.push('purchase_funnel');
    if (isSurveyModuleEnabled('brand_usage', formData)) mods.push('brand_usage');
    if (isSurveyModuleEnabled('brand_pricing_behavior', formData)) mods.push('brand_pricing_behavior');
    if (isSurveyModuleEnabled('brand_analyzer', formData)) mods.push('brand_analyzer');
    return Array.from(new Set(mods));
}

export function appendModuleToSequence(
    sequence: string[],
    moduleId: string
): string[] {
    return sequence.includes(moduleId) ? sequence : [...sequence, moduleId];
}

export function removeModuleFromSequence(
    sequence: string[],
    moduleId: string
): string[] {
    return sequence.filter((m) => m !== moduleId);
}
