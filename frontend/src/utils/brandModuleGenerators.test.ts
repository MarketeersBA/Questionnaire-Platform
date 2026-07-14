import { describe, expect, it } from 'vitest';
import { generateBrandUsageSchemaFromModule } from './brandUsageGenerator';
import { generateBrandPricingBehaviorSchemaFromModule } from './brandPricingBehaviorGenerator';
import { buildFallbackBrandUsageModule } from './brandUsageModuleUtils';
import { buildFallbackBrandPricingBehaviorModule } from './brandPricingBehaviorModuleUtils';
import type { SurveyFormData } from '../pages/CreateSurvey/types';

const baseForm = (overrides: Partial<SurveyFormData> = {}): SurveyFormData => ({
    survey_name: 'Test',
    survey_type: 'taste_test',
    links_count: 100,
    sample_capacity: 100,
    gate_quotas: {},
    config: { category: 'Chocolate', language: 'en' } as any,
    internal_brands_data: [],
    competitor_brands_data: [],
    schema: { layer1_structure: { sections: [] }, layer2_structure: { sections: [] } },
    layer1_screening_config: {} as any,
    google_form_id: '',
    google_form_url: '',
    ...overrides,
});

describe('brand module generators', () => {
    it('brand usage schema tags sections with module id and us_q* IDs', () => {
        const schema = generateBrandUsageSchemaFromModule(
            buildFallbackBrandUsageModule(),
            baseForm({ brand_usage: { is_enabled: true } })
        );
        expect(schema.sections).toHaveLength(1);
        expect(schema.sections[0].module).toBe('brand_usage');
        expect(schema.sections[0].questions.map((q: any) => q.id)).toEqual([
            'us_q1', 'us_q2', 'us_q3', 'us_q4',
        ]);
        expect(schema.sections[0].questions[0].text).toContain('Chocolate');
    });

    it('brand pricing schema tags sections with module id and cb_q* IDs', () => {
        const schema = generateBrandPricingBehaviorSchemaFromModule(
            buildFallbackBrandPricingBehaviorModule(),
            baseForm({ brand_pricing_behavior: { is_enabled: true } })
        );
        expect(schema.sections).toHaveLength(1);
        expect(schema.sections[0].module).toBe('brand_pricing_behavior');
        expect(schema.sections[0].questions.map((q: any) => q.id)).toEqual([
            'cb_q1', 'cb_q2', 'cb_q3', 'cb_q4',
        ]);
    });

    it('returns empty sections when module disabled', () => {
        const schema = generateBrandUsageSchemaFromModule(
            buildFallbackBrandUsageModule(),
            baseForm({ brand_usage: { is_enabled: false } })
        );
        expect(schema.sections).toEqual([]);
    });
});
