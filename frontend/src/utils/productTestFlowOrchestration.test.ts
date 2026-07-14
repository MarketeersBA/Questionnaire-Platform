import { describe, expect, it } from 'vitest';
import {
    advanceProductTestNavigation,
    applyProductTestNavigationAdvance,
    buildProductTestSubmission,
    buildProductTestWizardJourney,
    computeProductTestJourneyProgress,
    getNextProductTestPhase,
    getPreviousProductTestPhase,
    getProductTestSnapshot,
    getProductTestWizardPosition,
    getVisibleProductTestQuestions,
    hasTasteTestLayer2Sections,
    isProductTestEnabled,
    isProductTestQuestionVisible,
    reconcileHiddenConditionalAnswers,
    resolveInitialProductTestWizardMode,
    resolveProductTestNavigationBounds,
    resolveProductTestNavigationPosition,
    resolveProductTestBrandOrder,
    shouldShowProductTestPhaseIntro,
    validateProductTestSection,
} from './productTestFlowOrchestration';
import type { ProductTestSnapshot } from '../types/productTestRespondent';

const MOCK_SNAPSHOT: ProductTestSnapshot = {
    version: 1,
    language: 'en',
    phases: [
        {
            timing: 'before_use',
            label: 'Before Use',
            sections: [
                {
                    id: 'before_use_appearance',
                    title: 'Product Appearance',
                    module: 'product_test',
                    timing: 'before_use',
                    questions: [
                        {
                            id: 'pt_q01',
                            text: 'Product Look',
                            type: 'scale',
                            options: [],
                            required: true,
                            timing: 'before_use',
                            diagnostic_tag: 'PF',
                            questionMeta: { scaleMax: 5 },
                        },
                    ],
                },
            ],
        },
        {
            timing: 'during_use',
            label: 'During Use',
            sections: [
                {
                    id: 'during_use_prep',
                    title: 'Preparation',
                    module: 'product_test',
                    timing: 'during_use',
                    questions: [
                        {
                            id: 'pt_q08',
                            text: 'Ease of use',
                            type: 'scale',
                            options: [],
                            required: true,
                            timing: 'during_use',
                            diagnostic_tag: 'PF',
                            questionMeta: { scaleMax: 5 },
                        },
                    ],
                },
            ],
        },
    ],
    meta: { totalQuestions: 2, sectionCount: 2, phaseCount: 2, generatedAt: '2026-01-01' },
};

const BRAND_SNAPSHOT: ProductTestSnapshot = {
    ...MOCK_SNAPSHOT,
    phases: [
        {
            timing: 'before_use',
            label: 'Before Use',
            sections: [
                {
                    id: 'before_use_appearance_BrandA',
                    title: 'BrandA Appearance',
                    module: 'product_test',
                    timing: 'before_use',
                    brand: 'BrandA',
                    displayBrand: 'BrandA',
                    questions: [
                        {
                            id: 'BrandA_pt_q01',
                            text: 'BrandA Look',
                            type: 'scale',
                            options: [],
                            required: true,
                            timing: 'before_use',
                            diagnostic_tag: 'PF',
                            brand: 'BrandA',
                            canonicalQuestionId: 'pt_q01',
                            questionMeta: { scaleMax: 5 },
                        },
                    ],
                },
            ],
        },
    ],
    meta: { totalQuestions: 1, sectionCount: 1, phaseCount: 1, brandCount: 1, generatedAt: '2026-01-01' },
};

const MULTI_BRAND_JOURNEY_SNAPSHOT: ProductTestSnapshot = {
    version: 1,
    language: 'en',
    brand_context: {
        brands: ['Competitor X', 'Own Brand'],
        own_brand: 'Own Brand',
        category: 'Foam',
        testing_protocol: 'branded',
        blind_codes: {},
    },
    phases: [
        {
            timing: 'before_use',
            label: 'Before Use',
            sections: [
                {
                    id: 'before_use_appearance_Own Brand',
                    title: 'Own Brand Appearance',
                    module: 'product_test',
                    timing: 'before_use',
                    brand: 'Own Brand',
                    questions: [{ id: 'Own Brand_pt_q01', text: 'Own Look', type: 'scale', options: [], required: true, timing: 'before_use', diagnostic_tag: 'PF', questionMeta: {} }],
                },
                {
                    id: 'before_use_appearance_Competitor X',
                    title: 'Competitor Appearance',
                    module: 'product_test',
                    timing: 'before_use',
                    brand: 'Competitor X',
                    questions: [{ id: 'Competitor X_pt_q01', text: 'Comp Look', type: 'scale', options: [], required: true, timing: 'before_use', diagnostic_tag: 'PF', questionMeta: {} }],
                },
            ],
        },
        {
            timing: 'during_use',
            label: 'During Use',
            sections: [
                {
                    id: 'during_use_prep_Own Brand',
                    title: 'Own Brand Prep',
                    module: 'product_test',
                    timing: 'during_use',
                    brand: 'Own Brand',
                    questions: [{ id: 'Own Brand_pt_q08', text: 'Own Ease', type: 'scale', options: [], required: true, timing: 'during_use', diagnostic_tag: 'PF', questionMeta: {} }],
                },
                {
                    id: 'during_use_prep_Competitor X',
                    title: 'Competitor Prep',
                    module: 'product_test',
                    timing: 'during_use',
                    brand: 'Competitor X',
                    questions: [{ id: 'Competitor X_pt_q08', text: 'Comp Ease', type: 'scale', options: [], required: true, timing: 'during_use', diagnostic_tag: 'PF', questionMeta: {} }],
                },
            ],
        },
        {
            timing: 'after_use',
            label: 'After Use',
            sections: [
                {
                    id: 'after_use_overall_Own Brand',
                    title: 'Own Brand After',
                    module: 'product_test',
                    timing: 'after_use',
                    brand: 'Own Brand',
                    questions: [{ id: 'Own Brand_pt_q29', text: 'Own Liking', type: 'scale', options: [], required: true, timing: 'after_use', diagnostic_tag: null, questionMeta: {} }],
                },
                {
                    id: 'after_use_overall_Competitor X',
                    title: 'Competitor After',
                    module: 'product_test',
                    timing: 'after_use',
                    brand: 'Competitor X',
                    questions: [{ id: 'Competitor X_pt_q29', text: 'Comp Liking', type: 'scale', options: [], required: true, timing: 'after_use', diagnostic_tag: null, questionMeta: {} }],
                },
                {
                    id: 'product_preference',
                    title: 'Preference',
                    module: 'product_test',
                    timing: 'after_use',
                    questions: [{ id: 'pt_overall_preference', text: 'Which preferred?', type: 'mcq', options: ['A', 'B'], required: true, timing: 'after_use', diagnostic_tag: null, questionMeta: {} }],
                },
            ],
        },
        {
            timing: 'packaging',
            label: 'Packaging',
            sections: [
                {
                    id: 'packaging_presentation',
                    title: 'Packaging',
                    module: 'package_test',
                    timing: 'packaging',
                    questions: [{ id: 'pk_q01', text: 'Pack shape', type: 'scale', options: [], required: true, timing: 'packaging', diagnostic_tag: null, questionMeta: {} }],
                },
            ],
        },
    ],
    meta: { totalQuestions: 8, sectionCount: 8, phaseCount: 4, brandCount: 2, generatedAt: '2026-01-01' },
};

describe('productTestFlowOrchestration', () => {
    it('isProductTestEnabled uses snapshot not empty L2', () => {
        const survey = {
            survey_type: 'product_test',
            product_test_snapshot: MOCK_SNAPSHOT,
            layer2_questions: { sections: [] },
        };
        expect(isProductTestEnabled(survey)).toBe(true);
    });

    it('getProductTestSnapshot prefers API snapshot', () => {
        const snapshot = getProductTestSnapshot({
            product_test_snapshot: MOCK_SNAPSHOT,
        });
        expect(snapshot?.meta.totalQuestions).toBe(2);
    });

    it('hasTasteTestLayer2Sections ignores product_test modules', () => {
        expect(
            hasTasteTestLayer2Sections({
                layer2_questions: {
                    sections: [{ module: 'product_test', questions: [{ id: 'q1' }] }],
                },
            }),
        ).toBe(false);
        expect(
            hasTasteTestLayer2Sections({
                layer2_questions: {
                    sections: [{ module: 'taste_test', questions: [{ id: 'q1' }] }],
                },
            }),
        ).toBe(true);
    });

    it('getNextProductTestPhase advances across phases for single-brand snapshots', () => {
        const first = getNextProductTestPhase(MOCK_SNAPSHOT, 0, 0);
        expect(first).toEqual({ type: 'section', phaseIndex: 1, sectionIndex: 0 });

        const last = getNextProductTestPhase(MOCK_SNAPSHOT, 1, 0);
        expect(last).toEqual({ type: 'complete' });
    });

    it('resolveProductTestBrandOrder puts own brand first', () => {
        expect(resolveProductTestBrandOrder(MULTI_BRAND_JOURNEY_SNAPSHOT)).toEqual([
            'Own Brand',
            'Competitor X',
        ]);
    });

    it('buildProductTestWizardJourney completes one brand across timings before the next', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        expect(journey.map((step) => step.sectionId)).toEqual([
            'before_use_appearance_Own Brand',
            'during_use_prep_Own Brand',
            'after_use_overall_Own Brand',
            'before_use_appearance_Competitor X',
            'during_use_prep_Competitor X',
            'after_use_overall_Competitor X',
            'product_preference',
            'packaging_presentation',
        ]);
    });

    it('getNextProductTestPhase follows brand-first journey coordinates', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        const start = journey[0];
        const next = getNextProductTestPhase(
            MULTI_BRAND_JOURNEY_SNAPSHOT,
            start.phaseIndex,
            start.sectionIndex,
            journey,
        );
        expect(next).toEqual({
            type: 'section',
            phaseIndex: journey[1].phaseIndex,
            sectionIndex: journey[1].sectionIndex,
        });
        expect(journey[1].sectionId).toBe('during_use_prep_Own Brand');
    });

    it('getProductTestWizardPosition marks last journey step as final section', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        const last = journey[journey.length - 1];
        const position = getProductTestWizardPosition(
            MULTI_BRAND_JOURNEY_SNAPSHOT,
            last.phaseIndex,
            last.sectionIndex,
            journey,
        );
        expect(position.isLastSection).toBe(true);
        expect(position.journeyStepIndex).toBe(journey.length - 1);
    });

    it('validateProductTestSection flags missing required answers', () => {
        const section = MOCK_SNAPSHOT.phases[0].sections[0];
        const issues = validateProductTestSection({}, section, 'en');
        expect(issues).toHaveLength(1);
        expect(issues[0].questionId).toBe('pt_q01');
    });

    it('buildProductTestSubmission produces structured payload with registry and meta', () => {
        const payload = buildProductTestSubmission({ pt_q01: 4, pt_q08: 5 }, MOCK_SNAPSHOT, {
            durationSeconds: 120,
        });
        expect(payload.meta.totalAnswers).toBe(2);
        expect(payload.meta.duration_seconds).toBe(120);
        expect(payload.flat_evaluations).toHaveLength(2);
        expect(payload.flat_evaluations[0]).toMatchObject({
            question_id: 'pt_q01',
            brand: null,
            brand_display: null,
            canonical_question_id: 'pt_q01',
            attribute: 'Product Appearance',
            timing: 'before_use',
            module: 'product_test',
            diagnostic_tag: 'PF',
            question_text: 'Product Look',
            value: 4,
        });
        expect(payload.attribute_registry).toHaveLength(2);
        expect(payload.phases[0].sections[0].answers.pt_q01).toBe(4);
    });

    it('buildProductTestSubmission attaches brand fields for brand-looped snapshot', () => {
        const payload = buildProductTestSubmission(
            { BrandA_pt_q01: 4 },
            BRAND_SNAPSHOT,
            { resolveBrandDisplay: () => 'SAMPLE-123' },
        );
        expect(payload.flat_evaluations[0]).toMatchObject({
            question_id: 'BrandA_pt_q01',
            brand: 'BrandA',
            brand_display: 'SAMPLE-123',
            canonical_question_id: 'pt_q01',
            value: 4,
        });
        expect(payload.attribute_registry[0]).toMatchObject({
            question_id: 'BrandA_pt_q01',
            brand: 'BrandA',
            canonical_question_id: 'pt_q01',
        });
    });

    it('getProductTestWizardPosition resolves current section', () => {
        const pos = getProductTestWizardPosition(MOCK_SNAPSHOT, 0, 0);
        expect(pos.section?.id).toBe('before_use_appearance');
        expect(pos.isLastSection).toBe(false);
    });

    it('validateProductTestSection requires uploaded media reference for media-upload questions', () => {
        const section = {
            id: 'after_use_trial_media',
            title: 'Trial Media',
            module: 'trial_media_capture' as const,
            timing: 'after_use' as const,
            questions: [
                {
                    id: 'pt_trial_media_upload',
                    text: 'Upload a photo of your trial',
                    type: 'media-upload',
                    options: [],
                    required: true,
                    timing: 'after_use' as const,
                    diagnostic_tag: 'PF' as const,
                    questionMeta: {
                        acceptedMedia: 'image_or_video',
                        maxImageMb: 5,
                        maxVideoMb: 25,
                        maxVideoDurationSeconds: 60,
                    },
                },
            ],
        };

        expect(validateProductTestSection({}, section, 'en')).toHaveLength(1);
        expect(validateProductTestSection({}, section, 'en')[0].message).toMatch(/upload/i);

        const complete = validateProductTestSection(
            {
                pt_trial_media_upload: {
                    asset_id: 'asset-1',
                    media_type: 'image',
                    mime: 'image/jpeg',
                    size_bytes: 100,
                    uploaded_at: '2026-01-01T00:00:00Z',
                },
            },
            section,
            'en',
        );
        expect(complete).toHaveLength(0);
    });

    it('validateProductTestSection requires feedback and AI attempt for each heatmap pin', () => {
        const section = {
            id: 'packaging_heatmap_front',
            title: 'Packaging Heatmap',
            module: 'packaging_heatmap' as const,
            timing: 'packaging' as const,
            questions: [
                {
                    id: 'pkg_hm_front_attraction',
                    text: 'Tap areas you like',
                    type: 'packaging-heatmap',
                    options: [],
                    required: true,
                    timing: 'packaging' as const,
                    diagnostic_tag: null,
                    questionMeta: { imageSide: 'front', heatmapIntent: 'attraction' },
                },
            ],
        };

        const missingFeedback = validateProductTestSection(
            {
                pkg_hm_front_attraction: {
                    image_side: 'front',
                    intent: 'attraction',
                    ref_width: 800,
                    ref_height: 600,
                    regions: [],
                    clicks: [{ x: 0.1, y: 0.2 }],
                },
            },
            section,
            'en',
        );
        expect(missingFeedback).toHaveLength(1);

        const missingFollowUp = validateProductTestSection(
            {
                pkg_hm_front_attraction: {
                    image_side: 'front',
                    intent: 'attraction',
                    ref_width: 800,
                    ref_height: 600,
                    regions: [],
                    clicks: [{ x: 0.1, y: 0.2, feedback: { sentiment: 'like', comment: 'nice color' } }],
                },
            },
            section,
            'en',
            { requireHeatmapFollowUp: true },
        );
        expect(missingFollowUp).toHaveLength(1);

        const complete = validateProductTestSection(
            {
                pkg_hm_front_attraction: {
                    image_side: 'front',
                    intent: 'attraction',
                    ref_width: 800,
                    ref_height: 600,
                    regions: [],
                    clicks: [
                        { x: 0.1, y: 0.2, feedback: { sentiment: 'like', comment: 'nice color', follow_up_requested: true } },
                        { x: 0.4, y: 0.6, feedback: { sentiment: 'like', voice_note_asset_id: 'voice-1', follow_up_requested: true } },
                    ],
                },
            },
            section,
            'en',
            { requireHeatmapFollowUp: true },
        );
        expect(complete).toHaveLength(0);
    });

    it('buildProductTestSubmission embeds media asset reference in phase answers', () => {
        const mediaRef = {
            asset_id: 'asset-1',
            media_type: 'video' as const,
            mime: 'video/mp4',
            filename: 'trial.mp4',
            size_bytes: 2048,
            duration_seconds: 12,
            uploaded_at: '2026-01-01T00:00:00Z',
        };
        const snapshot: ProductTestSnapshot = {
            ...MOCK_SNAPSHOT,
            phases: [
                {
                    timing: 'after_use',
                    label: 'After Use',
                    sections: [
                        {
                            id: 'after_use_trial_media',
                            title: 'Trial Media',
                            module: 'trial_media_capture',
                            timing: 'after_use',
                            questions: [
                                {
                                    id: 'pt_trial_media_upload',
                                    text: 'Upload trial media',
                                    type: 'media-upload',
                                    options: [],
                                    required: true,
                                    timing: 'after_use',
                                    diagnostic_tag: 'PF',
                                    questionMeta: {},
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const payload = buildProductTestSubmission(
            { pt_trial_media_upload: mediaRef },
            snapshot,
        );
        expect(payload.phases[0].sections[0].answers.pt_trial_media_upload).toEqual(mediaRef);
        expect(payload.flat_evaluations[0].value).toEqual(mediaRef);
        expect(payload.flat_evaluations[0].value_kind).toBe('media_reference');
        expect(payload.flat_evaluations[0].media_asset_id).toBe('asset-1');
    });

    it('hides conditional why-recommend open-end unless scale is 6..10', () => {
        const section = {
            id: 'after_use_eval',
            title: 'Overall Evaluation',
            module: 'product_test' as const,
            timing: 'after_use' as const,
            questions: [
                {
                    id: 'pt_recommend_scale',
                    text: 'How likely are you to recommend this to family?',
                    type: 'scale',
                    options: [],
                    required: true,
                    timing: 'after_use' as const,
                    diagnostic_tag: 'EM' as const,
                    questionMeta: { scaleMax: 10 },
                },
                {
                    id: 'pt_why_recommend',
                    text: 'Why would you recommend this to your family?',
                    type: 'open-ended',
                    options: [],
                    required: true,
                    timing: 'after_use' as const,
                    diagnostic_tag: 'EM' as const,
                    questionMeta: {},
                    visibilityCondition: {
                        dependsOnQuestionId: 'pt_recommend_scale',
                        min: 6,
                        max: 10,
                    },
                },
            ],
        };

        expect(isProductTestQuestionVisible(section.questions[1], { pt_recommend_scale: 8 })).toBe(true);
        expect(isProductTestQuestionVisible(section.questions[1], { pt_recommend_scale: 5 })).toBe(false);
        expect(isProductTestQuestionVisible(section.questions[1], {})).toBe(false);

        expect(validateProductTestSection({ pt_recommend_scale: 4 }, section, 'en')).toHaveLength(0);
        expect(validateProductTestSection({ pt_recommend_scale: 8 }, section, 'en')).toHaveLength(1);

        const reconciled = reconcileHiddenConditionalAnswers(section, {
            pt_recommend_scale: 4,
            pt_why_recommend: 'Great taste',
        });
        expect(reconciled.clearedQuestionIds).toEqual(['pt_why_recommend']);
        expect(reconciled.answers.pt_why_recommend).toBeUndefined();
    });

    it('omits hidden conditional answers from submission payload', () => {
        const snapshot: ProductTestSnapshot = {
            version: 1,
            language: 'en',
            phases: [
                {
                    timing: 'after_use',
                    label: 'After Use',
                    sections: [
                        {
                            id: 'after_use_eval',
                            title: 'Overall Evaluation',
                            module: 'product_test',
                            timing: 'after_use',
                            questions: [
                                {
                                    id: 'pt_recommend_scale',
                                    text: 'Recommend to family?',
                                    type: 'scale',
                                    options: [],
                                    required: true,
                                    timing: 'after_use',
                                    diagnostic_tag: 'EM',
                                    questionMeta: { scaleMax: 10 },
                                },
                                {
                                    id: 'pt_why_recommend',
                                    text: 'Why recommend to family?',
                                    type: 'open-ended',
                                    options: [],
                                    required: true,
                                    timing: 'after_use',
                                    diagnostic_tag: 'EM',
                                    questionMeta: {},
                                    visibilityCondition: {
                                        dependsOnQuestionId: 'pt_recommend_scale',
                                        min: 6,
                                        max: 10,
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
            meta: { totalQuestions: 2, sectionCount: 1, phaseCount: 1, generatedAt: '2026-01-01' },
        };

        const payload = buildProductTestSubmission(
            {
                pt_recommend_scale: 4,
                pt_why_recommend: 'Should be dropped',
            },
            snapshot,
        );
        expect(payload.meta.totalAnswers).toBe(1);
        expect(payload.flat_evaluations[0].question_id).toBe('pt_recommend_scale');
        expect(payload.phases[0].sections[0].answers.pt_why_recommend).toBeUndefined();
    });
});

describe('Phase 4 regression — conditional visibility', () => {
    const conditionalSection = {
        id: 'after_use_eval',
        title: 'Overall Evaluation',
        module: 'product_test' as const,
        timing: 'after_use' as const,
        questions: [
            {
                id: 'pt_recommend_scale',
                text: 'Recommend to family?',
                type: 'scale',
                options: [],
                required: true,
                timing: 'after_use' as const,
                diagnostic_tag: 'EM' as const,
                questionMeta: { scaleMax: 10 },
            },
            {
                id: 'pt_why_recommend',
                text: 'Why recommend to family?',
                type: 'open-ended',
                options: [],
                required: true,
                timing: 'after_use' as const,
                diagnostic_tag: 'EM' as const,
                questionMeta: {},
                visibilityCondition: {
                    dependsOnQuestionId: 'pt_recommend_scale',
                    min: 6,
                    max: 10,
                },
            },
        ],
    };

    it('shows why-recommend only at scale boundaries 6 and 10', () => {
        const whyQ = conditionalSection.questions[1];
        expect(isProductTestQuestionVisible(whyQ, { pt_recommend_scale: 5 })).toBe(false);
        expect(isProductTestQuestionVisible(whyQ, { pt_recommend_scale: 6 })).toBe(true);
        expect(isProductTestQuestionVisible(whyQ, { pt_recommend_scale: 10 })).toBe(true);
        expect(isProductTestQuestionVisible(whyQ, { pt_recommend_scale: 11 })).toBe(false);
    });

    it('getVisibleProductTestQuestions omits hidden conditional open-end', () => {
        const visibleLow = getVisibleProductTestQuestions(conditionalSection, { pt_recommend_scale: 3 });
        expect(visibleLow.map((q) => q.id)).toEqual(['pt_recommend_scale']);

        const visibleHigh = getVisibleProductTestQuestions(conditionalSection, {
            pt_recommend_scale: 8,
            pt_why_recommend: 'Great taste',
        });
        expect(visibleHigh.map((q) => q.id)).toEqual(['pt_recommend_scale', 'pt_why_recommend']);
    });
});

describe('Phase 4 regression — brand-first journey', () => {
    it('walks the full multi-brand journey via getNextProductTestPhase', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        expect(journey).toHaveLength(8);

        let phaseIndex = journey[0].phaseIndex;
        let sectionIndex = journey[0].sectionIndex;

        for (let i = 0; i < journey.length - 1; i += 1) {
            const next = getNextProductTestPhase(
                MULTI_BRAND_JOURNEY_SNAPSHOT,
                phaseIndex,
                sectionIndex,
                journey,
            );
            expect(next.type).toBe('section');
            if (next.type !== 'section') break;
            expect(next.phaseIndex).toBe(journey[i + 1].phaseIndex);
            expect(next.sectionIndex).toBe(journey[i + 1].sectionIndex);
            phaseIndex = next.phaseIndex;
            sectionIndex = next.sectionIndex;
        }

        const terminal = getNextProductTestPhase(
            MULTI_BRAND_JOURNEY_SNAPSHOT,
            phaseIndex,
            sectionIndex,
            journey,
        );
        expect(terminal).toEqual({ type: 'complete' });
    });

    it('places packaging after all brand evaluations and preference', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        const packagingIndex = journey.findIndex((step) => step.journeyGroup === 'packaging');
        const lastBrandIndex = journey.findIndex(
            (step) => step.brand === 'Competitor X' && step.timing === 'after_use',
        );
        const preferenceIndex = journey.findIndex((step) => step.sectionId === 'product_preference');

        expect(lastBrandIndex).toBeGreaterThanOrEqual(0);
        expect(preferenceIndex).toBeGreaterThan(lastBrandIndex);
        expect(packagingIndex).toBeGreaterThan(preferenceIndex);
    });

    it('computeProductTestJourneyProgress advances with journey steps', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        expect(computeProductTestJourneyProgress(journey, 0, 'intro')).toBe(0);
        expect(computeProductTestJourneyProgress(journey, 0, 'section')).toBe(13);
        expect(computeProductTestJourneyProgress(journey, journey.length - 1, 'section')).toBe(100);
    });

    it('single-brand snapshot journey matches timing-first flattening', () => {
        const journey = buildProductTestWizardJourney(MOCK_SNAPSHOT);
        expect(journey.map((s) => s.sectionId)).toEqual([
            'before_use_appearance',
            'during_use_prep',
        ]);
    });
});

describe('product test respondent navigation model', () => {
    it('getPreviousProductTestPhase retreats along brand-first journey', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        const second = journey[1];
        const previous = getPreviousProductTestPhase(
            MULTI_BRAND_JOURNEY_SNAPSHOT,
            second.phaseIndex,
            second.sectionIndex,
            journey,
        );
        expect(previous).toEqual({
            type: 'section',
            phaseIndex: journey[0].phaseIndex,
            sectionIndex: journey[0].sectionIndex,
        });
    });

    it('advanceProductTestNavigation moves intro to section on same coordinates', () => {
        const cursor = {
            phaseIndex: 0,
            sectionIndex: 0,
            wizardMode: 'intro' as const,
        };
        const advance = advanceProductTestNavigation(MOCK_SNAPSHOT, cursor, 'forward');
        expect(advance).toEqual({
            type: 'section',
            phaseIndex: 0,
            sectionIndex: 0,
            wizardMode: 'section',
        });
    });

    it('advanceProductTestNavigation retreats section to intro when step had intro', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        const competitorBeforeUse = journey.find(
            (step) => step.brand === 'Competitor X' && step.timing === 'before_use',
        )!;
        const cursor = {
            phaseIndex: competitorBeforeUse.phaseIndex,
            sectionIndex: competitorBeforeUse.sectionIndex,
            wizardMode: 'section' as const,
        };
        const back = advanceProductTestNavigation(MULTI_BRAND_JOURNEY_SNAPSHOT, cursor, 'back', journey);
        expect(back).toEqual({
            type: 'intro',
            phaseIndex: competitorBeforeUse.phaseIndex,
            sectionIndex: competitorBeforeUse.sectionIndex,
        });
    });

    it('advanceProductTestNavigation returns boundary at first intro', () => {
        const cursor = { phaseIndex: 0, sectionIndex: 0, wizardMode: 'intro' as const };
        expect(advanceProductTestNavigation(MOCK_SNAPSHOT, cursor, 'back')).toEqual({ type: 'boundary' });
    });

    it('advanceProductTestNavigation retreats intro to previous section content', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        const competitorBeforeUse = journey.find(
            (step) => step.brand === 'Competitor X' && step.timing === 'before_use',
        )!;
        const ownAfterUse = journey.find(
            (step) => step.brand === 'Own Brand' && step.timing === 'after_use',
        )!;
        const cursor = {
            phaseIndex: competitorBeforeUse.phaseIndex,
            sectionIndex: competitorBeforeUse.sectionIndex,
            wizardMode: 'intro' as const,
        };
        const back = advanceProductTestNavigation(MULTI_BRAND_JOURNEY_SNAPSHOT, cursor, 'back', journey);
        expect(back.type).toBe('section');
        if (back.type === 'section') {
            expect(back.phaseIndex).toBe(ownAfterUse.phaseIndex);
            expect(back.sectionIndex).toBe(ownAfterUse.sectionIndex);
            expect(back.wizardMode).toBe('section');
        }
    });

    it('resolveProductTestNavigationPosition exposes bounds and progress', () => {
        const journey = buildProductTestWizardJourney(MOCK_SNAPSHOT);
        const position = resolveProductTestNavigationPosition(
            MOCK_SNAPSHOT,
            { phaseIndex: 0, sectionIndex: 0, wizardMode: 'intro' },
            journey,
        );
        expect(position.isFirstJourneyStep).toBe(true);
        expect(position.bounds.canGoBack).toBe(false);
        expect(position.progressPercent).toBe(computeProductTestJourneyProgress(journey, 0, 'intro'));
    });

    it('shouldShowProductTestPhaseIntro flags packaging and new brand before_use transitions', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        const packagingIndex = journey.findIndex((step) => step.journeyGroup === 'packaging');
        expect(shouldShowProductTestPhaseIntro(packagingIndex - 1, packagingIndex, journey)).toBe(true);

        const competitorBeforeUseIndex = journey.findIndex(
            (step) => step.brand === 'Competitor X' && step.timing === 'before_use',
        );
        expect(
            shouldShowProductTestPhaseIntro(competitorBeforeUseIndex - 1, competitorBeforeUseIndex, journey),
        ).toBe(true);
    });

    it('applyProductTestNavigationAdvance returns null on boundary and complete', () => {
        const cursor = { phaseIndex: 0, sectionIndex: 0, wizardMode: 'intro' as const };
        expect(applyProductTestNavigationAdvance(cursor, { type: 'boundary' })).toBeNull();
        expect(applyProductTestNavigationAdvance(cursor, { type: 'complete' })).toBeNull();
    });

    it('resolveInitialProductTestWizardMode starts at intro for first journey step', () => {
        expect(resolveInitialProductTestWizardMode(0)).toBe('intro');
        expect(resolveInitialProductTestWizardMode(2)).toBe('section');
    });

    it('resolveProductTestNavigationBounds allows back except at first intro', () => {
        expect(
            resolveProductTestNavigationBounds(MOCK_SNAPSHOT, {
                phaseIndex: 0,
                sectionIndex: 0,
                wizardMode: 'intro',
            }).canGoBack,
        ).toBe(false);
        expect(
            resolveProductTestNavigationBounds(MOCK_SNAPSHOT, {
                phaseIndex: 0,
                sectionIndex: 0,
                wizardMode: 'section',
            }).canGoBack,
        ).toBe(true);
    });

    it('walks the full multi-brand journey backward via getPreviousProductTestPhase', () => {
        const journey = buildProductTestWizardJourney(MULTI_BRAND_JOURNEY_SNAPSHOT);
        let phaseIndex = journey[journey.length - 1].phaseIndex;
        let sectionIndex = journey[journey.length - 1].sectionIndex;

        for (let i = journey.length - 1; i > 0; i -= 1) {
            const previous = getPreviousProductTestPhase(
                MULTI_BRAND_JOURNEY_SNAPSHOT,
                phaseIndex,
                sectionIndex,
                journey,
            );
            expect(previous.type).toBe('section');
            if (previous.type !== 'section') break;
            expect(previous.phaseIndex).toBe(journey[i - 1].phaseIndex);
            expect(previous.sectionIndex).toBe(journey[i - 1].sectionIndex);
            phaseIndex = previous.phaseIndex;
            sectionIndex = previous.sectionIndex;
        }

        const terminal = getPreviousProductTestPhase(
            MULTI_BRAND_JOURNEY_SNAPSHOT,
            journey[0].phaseIndex,
            journey[0].sectionIndex,
            journey,
        );
        expect(terminal).toEqual({ type: 'boundary' });
    });
});

describe('surveyFlowOrchestration product_test routing', () => {
    it('routes screening to product_test when enabled', async () => {
        const { getNextPhaseStep } = await import('./surveyFlowOrchestration');
        const survey = {
            module_sequence: ['screening', 'product_test', 'purchase_funnel'],
            survey_type: 'product_test',
            product_test_snapshot: MOCK_SNAPSHOT,
            layer2_questions: { sections: [] },
        };
        const next = getNextPhaseStep(survey, 'screening');
        expect(next).toEqual({ type: 'product_test' });
    });

    it('does not route to layer2 when only product test L2 sections existed', async () => {
        const { getNextPhaseStep, isRuntimeModuleEnabled } = await import('./surveyFlowOrchestration');
        const survey = {
            module_sequence: ['screening', 'taste_test', 'product_test'],
            layer2_questions: {
                sections: [{ module: 'product_test', questions: [{ id: 'q1' }] }],
            },
        };
        expect(isRuntimeModuleEnabled(survey, 'taste_test')).toBe(false);
        const next = getNextPhaseStep(survey, 'screening');
        expect(next.type).not.toBe('layer2');
    });
});
