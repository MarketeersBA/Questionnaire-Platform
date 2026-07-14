import { describe, expect, it } from 'vitest';
import { generateProductTestModuleSchema } from './productTestGenerator';
import { buildProductTestSnapshot } from './productTestSnapshotBuilder';
import { ProductTestConfig, ProductTestQuestion, PackageTestQuestion } from '../types/productTest';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';

const mockProductQuestions: ProductTestQuestion[] = [
    {
        question_id: 'pt_q01',
        attribute: 'Product Look',
        attribute_type: 'sub',
        parent_attribute: 'Product Appearance',
        diagnostic_tag: 'PF',
        question_type: 'scale 1-5',
        ar_text: 'مظهر المنتج',
        en_text: 'Product Look',
        ar_options: '1 = سيء جداً, 5 = ممتاز',
        en_options: '1 = Very Poor, 5 = Excellent',
        timing: 'Before Use',
        question_status: 'optional',
        order: 1
    },
    {
        question_id: 'pt_q05',
        attribute: 'Product Appearance',
        attribute_type: 'main',
        parent_attribute: null,
        diagnostic_tag: null,
        question_type: 'scale 1-10',
        ar_text: 'المظهر العام للمنتج',
        en_text: 'Overall Product Appearance',
        ar_options: '1 = لا يعجبني, 10 = يعجبني جداً',
        en_options: '1 = Dislike, 10 = Like Extremely',
        timing: 'Before Use',
        question_status: 'optional',
        order: 5
    },
    {
        question_id: 'pt_q08',
        attribute: 'Ease of Use',
        attribute_type: 'sub',
        parent_attribute: 'Preparation & Usage',
        diagnostic_tag: 'PF',
        question_type: 'scale 1-5',
        ar_text: 'سهولة الاستخدام',
        en_text: 'Ease of use',
        ar_options: null,
        en_options: null,
        timing: 'During Use',
        question_status: 'fixed',
        order: 8
    },
    {
        question_id: 'pt_q29',
        attribute: 'Overall Liking',
        attribute_type: '',
        parent_attribute: null,
        diagnostic_tag: null,
        question_type: 'scale 1-9',
        ar_text: 'الإعجاب العام',
        en_text: 'Overall Liking',
        ar_options: null,
        en_options: null,
        timing: 'After Use',
        question_status: 'fixed',
        order: 29
    }
];

const mockPackageQuestions: PackageTestQuestion[] = [
    {
        question_id: 'pk_q01',
        attribute: 'Pack Shape',
        attribute_type: 'sub',
        parent_attribute: 'Pack & Presentation',
        question_type: 'scale 1-5',
        ar_text: 'شكل العبوة',
        en_text: 'Pack Shape',
        ar_options: null,
        en_options: null,
        timing: 'Before Use',
        question_status: 'optional',
        order: 1
    },
    {
        question_id: 'pk_q07',
        attribute: 'Pack & Presentation',
        attribute_type: 'main',
        parent_attribute: null,
        question_type: 'scale 1-10',
        ar_text: 'العبوة والتقديم الإجمالي',
        en_text: 'Overall Pack & Presentation',
        ar_options: '1 = سيء جداً, 10 = ممتاز',
        en_options: '1 = Very Poor, 10 = Excellent',
        timing: 'Before Use',
        question_status: 'optional',
        order: 7
    }
];

const buildMockConfig = (overrides: Partial<ProductTestConfig> = {}): ProductTestConfig => ({
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
    ...overrides
});

function allSnapshotQuestionIds(config: ProductTestConfig) {
    const snapshot = buildProductTestSnapshot(config, mockProductQuestions, mockPackageQuestions);
    return snapshot.phases.flatMap((p) => p.sections.flatMap((s) => s.questions.map((q) => q.id)));
}

describe('productTestGenerator / snapshot builder', () => {
    it('always includes fixed questions', () => {
        const ids = allSnapshotQuestionIds(buildMockConfig());
        expect(ids).toContain('pt_q08');
        expect(ids).toContain('pt_q29');
        expect(ids).not.toContain('pt_q01');
    });

    it('includes optional questions when selected by optional_questions list', () => {
        const ids = allSnapshotQuestionIds(buildMockConfig({ optional_questions: ['pt_q01'] }));
        expect(ids).toContain('pt_q01');
    });

    it('includes question when attribute is in selected_attributes', () => {
        const ids = allSnapshotQuestionIds(buildMockConfig({ selected_attributes: ['Product Appearance'] }));
        expect(ids).toContain('pt_q01');
        expect(ids).toContain('pt_q05');
    });

    it('groups questions under parent attribute within timing phase', () => {
        const snapshot = buildProductTestSnapshot(
            buildMockConfig({ selected_attributes: ['Product Appearance'], language: 'ar' }),
            mockProductQuestions,
        );
        const beforePhase = snapshot.phases.find((p) => p.timing === 'before_use');
        const appearanceSection = beforePhase?.sections.find((s) => s.title === 'مظهر المنتج');
        expect(appearanceSection).toBeDefined();
        expect(appearanceSection?.questions.map((q) => q.id)).toContain('pt_q01');
        expect(appearanceSection?.questions.map((q) => q.id)).toContain('pt_q05');
    });

    it('places fixed during-use question in during_use phase', () => {
        const snapshot = buildProductTestSnapshot(buildMockConfig(), mockProductQuestions);
        const duringPhase = snapshot.phases.find((p) => p.timing === 'during_use');
        expect(duringPhase).toBeDefined();
        expect(duringPhase?.sections.flatMap((s) => s.questions.map((q) => q.id))).toContain('pt_q08');
    });

    it('does not write product test into layer2_structure', () => {
        const schema = generateProductTestModuleSchema(buildMockConfig(), mockProductQuestions);
        expect(schema.layer2_structure.sections).toHaveLength(0);
        expect(schema.product_test_snapshot.meta.totalQuestions).toBeGreaterThan(0);
    });

    it('attaches package test in packaging phase when enabled', () => {
        const snapshot = buildProductTestSnapshot(
            buildMockConfig({ package_test_enabled: true }),
            mockProductQuestions,
            mockPackageQuestions,
        );
        const packaging = snapshot.phases.find((p) => p.timing === 'packaging');
        expect(packaging).toBeDefined();
        const ids = packaging!.sections.flatMap((s) => s.questions.map((q) => q.id));
        expect(ids).toContain('pk_q01');
        expect(ids).toContain('pk_q07');
    });

    it('filters package test questions by selected package_test_attributes', () => {
        const snapshot = buildProductTestSnapshot(
            buildMockConfig({ package_test_enabled: true, package_test_attributes: ['Pack Shape'] }),
            mockProductQuestions,
            mockPackageQuestions,
        );
        const ids = snapshot.phases
            .find((p) => p.timing === 'packaging')!
            .sections.flatMap((s) => s.questions.map((q) => q.id));
        expect(ids).toContain('pk_q01');
        expect(ids).not.toContain('pk_q07');
    });

    it('loops all brands with scoped question ids and placeholder text', () => {
        const snapshot = buildProductTestSnapshot(
            buildMockConfig({ selected_attributes: ['Product Appearance'] }),
            mockProductQuestions,
            [],
            new Date().toISOString(),
            {
                brands: ['Own Brand', 'Competitor X'],
                own_brand: 'Own Brand',
                category: 'Foam',
                testing_protocol: 'branded',
            },
        );

        expect(snapshot.brand_context?.brands).toEqual(['Own Brand', 'Competitor X']);
        expect(snapshot.meta.brandCount).toBe(2);

        const beforePhase = snapshot.phases.find((p) => p.timing === 'before_use');
        expect(beforePhase?.sections.length).toBe(2);

        const ownSection = beforePhase?.sections.find((s) => s.brand === 'Own Brand');
        expect(ownSection?.questions[0]?.text).toBe('Own Brand Look');
        expect(ownSection?.questions[0]?.id).toBe('Own Brand_pt_q01');

        const afterPhase = snapshot.phases.find((p) => p.timing === 'after_use');
        expect(afterPhase?.sections.some((s) => s.id === 'product_preference')).toBe(true);
    });

    it('uses blind sample codes in composed question text', () => {
        const snapshot = buildProductTestSnapshot(
            buildMockConfig({ selected_attributes: ['Product Appearance'] }),
            mockProductQuestions,
            [],
            new Date().toISOString(),
            {
                brands: ['Own Brand'],
                category: 'Foam',
                testing_protocol: 'blind',
                blind_codes: { 'Own Brand': 'SAMPLE-A' },
            },
        );

        const q = snapshot.phases
            .find((p) => p.timing === 'before_use')
            ?.sections[0]?.questions.find((row) => row.canonicalQuestionId === 'pt_q01');

        expect(q?.text).toBe('SAMPLE-A Look');
        expect(q?.displayBrand).toBe('SAMPLE-A');
    });
});
