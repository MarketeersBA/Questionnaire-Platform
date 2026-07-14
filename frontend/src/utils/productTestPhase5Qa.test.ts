/**
 * Phase 5 — integrated QA smoke tests mapping manual respondent checklist
 * to automated regression coverage for Phases 1–3 behavior.
 */
import { describe, expect, it } from 'vitest';
import { isAiFollowUpEligible } from './aiFollowup';
import {
    buildProductTestWizardJourney,
    getNextProductTestPhase,
    getVisibleProductTestQuestions,
    isProductTestQuestionVisible,
    resolveProductTestBrandOrder,
} from './productTestFlowOrchestration';
import { buildProductTestSnapshot } from './productTestSnapshotBuilder';
import type { ProductTestSnapshot } from '../types/productTestRespondent';
import type { ProductTestConfig, ProductTestQuestion } from '../types/productTest';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';

const TASTE_L2_BASE = {
    surface: 'taste_l2_open_end' as const,
    effectiveType: 'open-ended',
    timing: 'After Taste',
    sectionTitle: 'General Evaluation',
};

const RECOMMEND_BANK: ProductTestQuestion[] = [
    {
        question_id: 'pt_q30',
        attribute: 'Recommendation',
        attribute_type: 'sub',
        parent_attribute: 'Overall Evaluation',
        diagnostic_tag: 'EM',
        question_type: 'scale 1-10',
        en_text: 'How likely are you to recommend this product to family or friends?',
        ar_text: null,
        en_options: null,
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
        ar_text: null,
        en_options: 'open-end',
        ar_options: null,
        timing: 'After Use',
        question_status: 'optional',
        order: 31,
    },
];

const QA_CONFIG: ProductTestConfig = {
    version: 1,
    language: 'en',
    selected_attributes: ['Overall Evaluation', 'Product Appearance'],
    fixed_questions: ['pt_q08'],
    optional_questions: ['pt_q01', 'pt_q30', 'pt_q31'],
    package_test_enabled: false,
    package_test_attributes: [],
    packaging_heatmap_enabled: false,
    packaging_heatmap_images: { front: null, back: null },
    trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
    status: 'draft',
};

const QA_BANK: ProductTestQuestion[] = [
    {
        question_id: 'pt_q01',
        attribute: 'Product Look',
        attribute_type: 'sub',
        parent_attribute: 'Product Appearance',
        diagnostic_tag: 'PF',
        question_type: 'scale 1-5',
        en_text: 'Product Look',
        ar_text: null,
        en_options: null,
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
    ...RECOMMEND_BANK,
];

function buildQaSnapshot(): ProductTestSnapshot {
    return buildProductTestSnapshot(
        QA_CONFIG,
        QA_BANK,
        [],
        '2026-01-01T00:00:00.000Z',
        {
            brands: ['Competitor X', 'Own Brand'],
            own_brand: 'Own Brand',
            category: 'Foam',
            testing_protocol: 'branded',
            blind_codes: {},
        },
    );
}

function findWhyRecommendQuestion(snapshot: ProductTestSnapshot, brand: string) {
    const after = snapshot.phases.find((p) => p.timing === 'after_use');
    const section = after?.sections.find((s) => s.brand === brand);
    return section?.questions.find((q) => q.canonicalQuestionId === 'pt_q31');
}

describe('Phase 5 QA — AI/MI respondent safety', () => {
    describe('taste L2 like / dislike / recommend probing', () => {
        it.each([
            ['like', 'What did you like about the taste?'],
            ['dislike', 'What did you dislike about the taste?'],
            ['recommend', 'Would you recommend this product to your family?'],
        ] as const)('allows taste %s open-end', (_kind, questionText) => {
            expect(isAiFollowUpEligible({ ...TASTE_L2_BASE, questionText })).toBe(true);
        });
    });

    it('blocks configurable module and specify-style open inputs', () => {
        expect(
            isAiFollowUpEligible({
                surface: 'product_test_open_end',
                questionText: 'How do you typically use this brand at home?',
                effectiveType: 'open-ended',
            }),
        ).toBe(false);
        expect(
            isAiFollowUpEligible({
                surface: 'product_test_open_end',
                questionText: 'Please specify your answer in more detail',
                effectiveType: 'open-ended',
            }),
        ).toBe(false);
        expect(
            isAiFollowUpEligible({
                surface: 'configurable_module_open_end' as 'taste_l2_open_end',
                questionText: 'What did you like about the brand?',
                effectiveType: 'open-ended',
            }),
        ).toBe(false);
    });

    it('allows heatmap overall comment surface regardless of wording', () => {
        expect(
            isAiFollowUpEligible({
                surface: 'product_test_heatmap_comment',
                questionText: 'Overall packaging comment',
            }),
        ).toBe(true);
    });
});

describe('Phase 5 QA — conditional recommend open-end', () => {
    const snapshot = buildQaSnapshot();

    it('skips why-recommend when scale is 1..5', () => {
        const why = findWhyRecommendQuestion(snapshot, 'Own Brand');
        expect(why?.visibilityCondition?.dependsOnQuestionId).toBe('Own Brand_pt_q30');

        for (const score of [1, 2, 3, 4, 5]) {
            expect(isProductTestQuestionVisible(why!, { 'Own Brand_pt_q30': score })).toBe(false);
        }
    });

    it('shows why-recommend when scale is 6..10 and allows AI/MI on that open-end', () => {
        const why = findWhyRecommendQuestion(snapshot, 'Own Brand')!;
        const section = snapshot.phases
            .find((p) => p.timing === 'after_use')!
            .sections.find((s) => s.brand === 'Own Brand')!;

        for (const score of [6, 7, 8, 9, 10]) {
            const answers = { 'Own Brand_pt_q30': score };
            expect(isProductTestQuestionVisible(why, answers)).toBe(true);
            expect(getVisibleProductTestQuestions(section, answers).map((q) => q.id)).toContain(
                'Own Brand_pt_q31',
            );
        }

        expect(
            isAiFollowUpEligible({
                surface: 'product_test_open_end',
                questionText: why.text,
                effectiveType: 'open-ended',
            }),
        ).toBe(true);
    });
});

describe('Phase 5 QA — brand-first journey', () => {
    const snapshot = buildQaSnapshot();

    it('evaluates own brand across all timings before competitor begins', () => {
        expect(resolveProductTestBrandOrder(snapshot)).toEqual(['Own Brand', 'Competitor X']);

        const journey = buildProductTestWizardJourney(snapshot);
        const firstCompetitorBefore = journey.findIndex(
            (step) => step.brand === 'Competitor X' && step.timing === 'before_use',
        );
        const lastOwnAfter = journey.findIndex(
            (step) => step.brand === 'Own Brand' && step.timing === 'after_use',
        );

        expect(firstCompetitorBefore).toBeGreaterThan(lastOwnAfter);

        const ownSteps = journey.filter((step) => step.brand === 'Own Brand');
        expect(ownSteps.map((s) => s.timing)).toEqual(['before_use', 'during_use', 'after_use']);
    });

    it('navigates own brand before → during → after without jumping to competitor', () => {
        const journey = buildProductTestWizardJourney(snapshot);
        const ownBefore = journey.find((s) => s.brand === 'Own Brand' && s.timing === 'before_use')!;
        const ownDuring = journey.find((s) => s.brand === 'Own Brand' && s.timing === 'during_use')!;
        const ownAfter = journey.find((s) => s.brand === 'Own Brand' && s.timing === 'after_use')!;

        const toDuring = getNextProductTestPhase(
            snapshot,
            ownBefore.phaseIndex,
            ownBefore.sectionIndex,
            journey,
        );
        expect(toDuring).toMatchObject({
            type: 'section',
            phaseIndex: ownDuring.phaseIndex,
            sectionIndex: ownDuring.sectionIndex,
        });

        const toAfter = getNextProductTestPhase(
            snapshot,
            ownDuring.phaseIndex,
            ownDuring.sectionIndex,
            journey,
        );
        expect(toAfter).toMatchObject({
            type: 'section',
            phaseIndex: ownAfter.phaseIndex,
            sectionIndex: ownAfter.sectionIndex,
        });
    });
});
