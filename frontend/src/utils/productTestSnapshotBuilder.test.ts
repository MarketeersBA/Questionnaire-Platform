import { describe, expect, it } from 'vitest';
import { buildProductTestSnapshot, migrateLegacyL2ToProductTestSnapshot } from './productTestSnapshotBuilder';
import type { ProductTestConfig, ProductTestQuestion } from '../types/productTest';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';

const MOCK_BANK: ProductTestQuestion[] = [
    {
        question_id: 'pt_q01',
        attribute: 'Product Look',
        attribute_type: 'sub',
        parent_attribute: 'Product Appearance',
        diagnostic_tag: 'PF',
        question_type: 'scale 1-5',
        en_text: 'Product Look',
        ar_text: 'مظهر المنتج',
        en_options: '1 = Very Poor, 5 = Excellent',
        ar_options: null,
        timing: 'Before Use',
        question_status: 'optional',
        order: 1,
    },
    {
        question_id: 'pt_q08',
        attribute: 'Ease of Use',
        attribute_type: 'sub',
        parent_attribute: 'Preparation & Usage',
        diagnostic_tag: 'PF',
        question_type: 'scale 1-5',
        en_text: 'Ease of use',
        ar_text: null,
        en_options: null,
        ar_options: null,
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
        en_text: 'Overall Liking',
        ar_text: null,
        en_options: null,
        ar_options: null,
        timing: 'After Use',
        question_status: 'fixed',
        order: 29,
    },
];

const CONFIG: ProductTestConfig = {
    version: 1,
    language: 'en',
    selected_attributes: ['Product Appearance'],
    fixed_questions: ['pt_q08', 'pt_q29'],
    optional_questions: [],
    package_test_enabled: false,
    package_test_attributes: [],
    packaging_heatmap_enabled: false,
    packaging_heatmap_images: { front: null, back: null },
    trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
    status: 'draft',
};

const BRAND_CONTEXT = {
    brands: ['BrandA', 'BrandB'],
    own_brand: 'BrandA',
    category: 'Foam',
    testing_protocol: 'branded' as const,
    blind_codes: {},
};

describe('productTestSnapshotBuilder', () => {
    it('builds 2 brands × 3 product phases with prefixed question ids', () => {
        const snapshot = buildProductTestSnapshot(
            CONFIG,
            MOCK_BANK,
            [],
            '2026-01-01T00:00:00.000Z',
            BRAND_CONTEXT,
        );

        const productPhases = snapshot.phases.filter((p) => p.timing !== 'packaging');
        expect(productPhases.map((p) => p.timing)).toEqual(['before_use', 'during_use', 'after_use']);

        for (const phase of productPhases) {
            expect(phase.sections.filter((s) => s.brand === 'BrandA').length).toBeGreaterThan(0);
            expect(phase.sections.filter((s) => s.brand === 'BrandB').length).toBeGreaterThan(0);
        }

        const beforeIds = productPhases
            .find((p) => p.timing === 'before_use')!
            .sections.flatMap((s) => s.questions.map((q) => q.id));

        expect(beforeIds).toContain('BrandA_pt_q01');
        expect(beforeIds).toContain('BrandB_pt_q01');
        expect(beforeIds.every((id) => id.startsWith('Brand'))).toBe(true);
    });

    it('doubles attribute sections per phase for two brands', () => {
        const snapshot = buildProductTestSnapshot(
            CONFIG,
            MOCK_BANK,
            [],
            '2026-01-01T00:00:00.000Z',
            BRAND_CONTEXT,
        );

        const before = snapshot.phases.find((p) => p.timing === 'before_use')!;
        const brandSections = before.sections.filter((s) => s.brand);
        expect(brandSections).toHaveLength(2);
        expect(snapshot.meta.brandCount).toBe(2);
        expect(snapshot.meta.questionsPerBrand).toBeGreaterThan(0);
    });

    it('legacy single-pass snapshot has no brand prefix when brand context omitted', () => {
        const snapshot = buildProductTestSnapshot(CONFIG, MOCK_BANK, [], '2026-01-01T00:00:00.000Z');
        const ids = snapshot.phases.flatMap((p) =>
            p.sections.flatMap((s) => s.questions.map((q) => q.id)),
        );
        expect(ids).toContain('pt_q08');
        expect(ids.some((id) => id.includes('BrandA_'))).toBe(false);
        expect(snapshot.brand_context).toBeUndefined();
    });

    it('migrateLegacyL2ToProductTestSnapshot extracts product_test sections by timing', () => {
        const migrated = migrateLegacyL2ToProductTestSnapshot({
            sections: [
                {
                    module: 'product_test',
                    title: 'Appearance',
                    questions: [
                        {
                            id: 'pt_q01',
                            text: 'Look',
                            type: 'scale',
                            timing: 'before_use',
                            diagnostic_tag: 'PF',
                        },
                    ],
                },
                {
                    module: 'package_test',
                    title: 'Packaging',
                    questions: [{ id: 'pkg_q01', text: 'Package', type: 'scale' }],
                },
            ],
        }, 'en');

        expect(migrated).not.toBeNull();
        expect(migrated!.phases.some((p) => p.timing === 'before_use')).toBe(true);
        expect(migrated!.phases.some((p) => p.timing === 'packaging')).toBe(true);
    });

    it('pairs recommendation scale with why-recommend open-end visibility metadata', () => {
        const recommendBank: ProductTestQuestion[] = [
            {
                question_id: 'pt_q30',
                attribute: 'Recommendation',
                attribute_type: 'sub',
                parent_attribute: 'Overall Evaluation',
                diagnostic_tag: 'EM',
                question_type: 'scale 1-10',
                en_text: 'How likely are you to recommend this product to family or friends?',
                ar_text: 'ما مدى احتمال أن توصي بهذا المنتج؟',
                en_options: '1 = Not at all likely, 10 = Extremely likely',
                ar_options: null,
                timing: 'After Use',
                question_status: 'optional',
                order: 30,
            },
            {
                question_id: 'pt_q31',
                attribute: 'Why Recommend',
                attribute_type: 'sub',
                parent_attribute: 'Overall Evaluation',
                diagnostic_tag: 'EM',
                question_type: 'Open-End',
                en_text: 'Why would you recommend this product to your family?',
                ar_text: 'لماذا توصي بهذا المنتج؟',
                en_options: 'open-end',
                ar_options: null,
                timing: 'After Use',
                question_status: 'optional',
                order: 31,
            },
        ];

        const snapshot = buildProductTestSnapshot(
            {
                ...CONFIG,
                selected_attributes: ['Overall Evaluation'],
                fixed_questions: [],
                optional_questions: ['pt_q30', 'pt_q31'],
            },
            recommendBank,
            [],
            '2026-01-01T00:00:00.000Z',
            BRAND_CONTEXT,
        );

        const afterPhase = snapshot.phases.find((p) => p.timing === 'after_use');
        expect(afterPhase).toBeDefined();

        const ownBrandSection = afterPhase!.sections.find((s) => s.brand === 'BrandA');
        expect(ownBrandSection).toBeDefined();

        const scaleQ = ownBrandSection!.questions.find((q) => q.canonicalQuestionId === 'pt_q30');
        const whyQ = ownBrandSection!.questions.find((q) => q.canonicalQuestionId === 'pt_q31');

        expect(scaleQ?.id).toBe('BrandA_pt_q30');
        expect(scaleQ?.visibilityCondition).toBeUndefined();
        expect(whyQ?.visibilityCondition).toEqual({
            dependsOnQuestionId: 'BrandA_pt_q30',
            min: 6,
            max: 10,
        });

        const competitorSection = afterPhase!.sections.find((s) => s.brand === 'BrandB');
        const competitorWhy = competitorSection!.questions.find((q) => q.canonicalQuestionId === 'pt_q31');
        expect(competitorWhy?.visibilityCondition?.dependsOnQuestionId).toBe('BrandB_pt_q30');
    });

    it('does not attach visibility metadata to unrelated open-ends in the same section', () => {
        const bank: ProductTestQuestion[] = [
            {
                question_id: 'pt_q30',
                attribute: 'Recommendation',
                attribute_type: 'sub',
                parent_attribute: 'Overall Evaluation',
                diagnostic_tag: 'EM',
                question_type: 'scale 1-10',
                en_text: 'How likely are you to recommend this to family?',
                ar_text: null,
                en_options: null,
                ar_options: null,
                timing: 'After Use',
                question_status: 'optional',
                order: 30,
            },
            {
                question_id: 'pt_q32',
                attribute: 'Other',
                attribute_type: 'sub',
                parent_attribute: 'Overall Evaluation',
                diagnostic_tag: null,
                question_type: 'Open-End',
                en_text: 'Any other comments about the product?',
                ar_text: null,
                en_options: 'open-end',
                ar_options: null,
                timing: 'After Use',
                question_status: 'optional',
                order: 32,
            },
        ];

        const snapshot = buildProductTestSnapshot(
            {
                ...CONFIG,
                selected_attributes: ['Overall Evaluation'],
                fixed_questions: [],
                optional_questions: ['pt_q30', 'pt_q32'],
            },
            bank,
            [],
            '2026-01-01T00:00:00.000Z',
            { ...BRAND_CONTEXT, brands: ['BrandA'] },
        );

        const after = snapshot.phases.find((p) => p.timing === 'after_use')!;
        const genericOpen = after.sections
            .flatMap((s) => s.questions)
            .find((q) => q.canonicalQuestionId === 'pt_q32');
        expect(genericOpen?.visibilityCondition).toBeUndefined();
    });
});
