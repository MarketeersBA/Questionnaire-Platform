import { describe, expect, it } from 'vitest';
import { buildProductTestL2Preview } from './productTestPreview';
import type { ProductTestConfig, ProductTestQuestion } from '../types/productTest';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';

const mockBank: ProductTestQuestion[] = [
    {
        question_id: 'pt_q08',
        attribute: 'Ease of Use',
        attribute_type: 'sub',
        parent_attribute: 'Preparation & Usage',
        diagnostic_tag: 'PF',
        question_type: 'scale 1-5',
        ar_text: 'ar',
        en_text: 'Ease of use',
        ar_options: null,
        en_options: null,
        timing: 'During Use',
        question_status: 'fixed',
        order: 8,
    },
    {
        question_id: 'pt_q29',
        attribute: 'Overall Liking',
        attribute_type: '',
        parent_attribute: null,
        diagnostic_tag: null,
        question_type: 'scale 1-9',
        ar_text: 'ar',
        en_text: 'Overall Liking',
        ar_options: null,
        en_options: null,
        timing: 'After Use',
        question_status: 'fixed',
        order: 29,
    },
];

const baseConfig: ProductTestConfig = {
    version: 1,
    language: 'en',
    selected_attributes: [],
    fixed_questions: [],
    optional_questions: [],
    package_test_enabled: false,
    package_test_attributes: [],
    packaging_heatmap_enabled: false,
    packaging_heatmap_images: { front: null, back: null },
    trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
    status: 'draft',
};

describe('productTestPreview', () => {
    it('buildProductTestL2Preview returns sections for fixed questions', () => {
        const preview = buildProductTestL2Preview(baseConfig, mockBank);
        expect(preview.sectionCount).toBeGreaterThan(0);
        expect(preview.totalQuestions).toBeGreaterThanOrEqual(2);
        expect(preview.sections.some(s => s.title.includes('Overall'))).toBe(true);
    });

    it('includes trial media section in selected phase when enabled', () => {
        const preview = buildProductTestL2Preview(
            {
                ...baseConfig,
                trial_media_capture: {
                    ...DEFAULT_TRIAL_MEDIA_CAPTURE,
                    enabled: true,
                    timing: 'during_use',
                },
            },
            mockBank,
        );
        const mediaSection = preview.sections.find(
            (s) => s.module === 'trial_media_capture' && s.timing === 'during_use',
        );
        expect(mediaSection).toBeDefined();
        expect(mediaSection?.questionCount).toBe(1);
        expect(preview.totalQuestions).toBeGreaterThanOrEqual(3);
    });

    it('excludes trial media section when toggle disabled', () => {
        const preview = buildProductTestL2Preview(baseConfig, mockBank);
        expect(preview.sections.some((s) => s.module === 'trial_media_capture')).toBe(false);
    });
});

describe('productTestConfigPersistence', () => {
    it('toApiCreatePayload strips server fields', async () => {
        const { toApiCreatePayload } = await import('./productTestConfigPersistence');
        const payload = toApiCreatePayload({
            ...baseConfig,
            config_id: 'abc',
            family_id: 'fam',
            selected_attributes: ['A'],
        });
        expect(payload).not.toHaveProperty('config_id');
        expect(payload.selected_attributes).toEqual(['A']);
    });

    it('formatSavedConfigLabel builds readable string', async () => {
        const { formatSavedConfigLabel } = await import('./productTestConfigPersistence');
        const label = formatSavedConfigLabel({
            ...baseConfig,
            selected_attributes: ['Product Appearance', 'Ease of Use', 'Core'],
            language: 'ar',
            package_test_enabled: true,
            version: 2,
        });
        expect(label).toContain('AR');
        expect(label).toContain('Package');
        expect(label).toContain('v2');
    });
});
