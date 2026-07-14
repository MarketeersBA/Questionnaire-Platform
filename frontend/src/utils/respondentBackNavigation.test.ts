import { describe, expect, it } from 'vitest';
import {
    advanceProductTestNavigation,
    applyProductTestNavigationAdvance,
    buildProductTestWizardJourney,
    getPreviousProductTestPhase,
    getNextProductTestPhase,
} from './productTestFlowOrchestration';
import type { ProductTestSnapshot } from '../types/productTestRespondent';
import {
    advanceTasteTestNavigation,
    applyTasteTestNavigationAdvance,
    resolveTasteTestRespondentNavigation,
} from './tasteTestRespondentNavigation';
import { buildFollowUpNavigationSuspendPlan } from './followUpNavigationSafety';
import type { FollowUpStateMap } from './aiFollowup';

const TASTE_SURVEY = {
    customizations: { brands: ['BrandA', 'BrandB'] },
    layer2_questions: {
        sections: [
            { title: 'BrandA', brand: 'BrandA', questions: [{ id: 'q1' }] },
            { title: 'BrandB', brand: 'BrandB', questions: [{ id: 'q1' }] },
        ],
    },
};

const PRODUCT_SNAPSHOT: ProductTestSnapshot = {
    version: 1,
    language: 'en',
    phases: [
        {
            timing: 'before_use',
            label: 'Before',
            sections: [
                {
                    id: 'before_use_appearance',
                    title: 'Appearance',
                    module: 'product_test',
                    timing: 'before_use',
                    questions: [{
                        id: 'pt_q01',
                        text: 'Look',
                        type: 'scale',
                        options: [],
                        required: true,
                        timing: 'before_use',
                        diagnostic_tag: 'PF',
                        questionMeta: { scaleMax: 5 },
                    }],
                },
            ],
        },
        {
            timing: 'during_use',
            label: 'During',
            sections: [
                {
                    id: 'during_use_prep',
                    title: 'Prep',
                    module: 'product_test',
                    timing: 'during_use',
                    questions: [{
                        id: 'pt_q08',
                        text: 'Ease',
                        type: 'scale',
                        options: [],
                        required: true,
                        timing: 'during_use',
                        diagnostic_tag: 'PF',
                        questionMeta: { scaleMax: 5 },
                    }],
                },
            ],
        },
    ],
    meta: { totalQuestions: 2, sectionCount: 2, phaseCount: 2, generatedAt: '2026-01-01' },
};

function walkProductTestForward(journey: ReturnType<typeof buildProductTestWizardJourney>) {
    const cursors: Array<{ phaseIndex: number; sectionIndex: number; wizardMode: 'intro' | 'section' }> = [];
    let cursor = { phaseIndex: journey[0].phaseIndex, sectionIndex: journey[0].sectionIndex, wizardMode: 'intro' as const };

    for (let guard = 0; guard < 20; guard += 1) {
        cursors.push({ ...cursor });
        const advance = advanceProductTestNavigation(PRODUCT_SNAPSHOT, cursor, 'forward', journey);
        if (advance.type === 'complete') break;
        const next = applyProductTestNavigationAdvance(cursor, advance);
        if (!next) break;
        cursor = next;
    }

    return cursors;
}

describe('respondent back navigation — taste test', () => {
    it('back button retreats brand pages without mutating answers', () => {
        const answers = { BrandA_q1: 8, BrandB_q1: 4 };
        let cursor = { brandIndex: 1 };

        const backAdvance = advanceTasteTestNavigation(cursor, TASTE_SURVEY, 'back');
        expect(backAdvance).toEqual({ type: 'brand', brandIndex: 0 });
        cursor = applyTasteTestNavigationAdvance(backAdvance, TASTE_SURVEY)!;

        const forwardAdvance = advanceTasteTestNavigation(cursor, TASTE_SURVEY, 'forward');
        expect(forwardAdvance).toEqual({ type: 'brand', brandIndex: 1 });

        expect(answers).toEqual({ BrandA_q1: 8, BrandB_q1: 4 });
    });

    it('first brand page returns boundary for in-flow back', () => {
        const navigation = resolveTasteTestRespondentNavigation(
            { brandIndex: 0 },
            TASTE_SURVEY,
            { allowCrossPhaseBack: false },
        );
        expect(navigation.bounds.canGoBack).toBe(false);
        expect(advanceTasteTestNavigation({ brandIndex: 0 }, TASTE_SURVEY, 'back')).toEqual({
            type: 'boundary',
        });
    });

    it('first brand page allows back when cross-phase is enabled', () => {
        const navigation = resolveTasteTestRespondentNavigation(
            { brandIndex: 0 },
            TASTE_SURVEY,
            { allowCrossPhaseBack: true },
        );
        expect(navigation.bounds.canGoBack).toBe(true);
    });
});

describe('respondent back navigation — product test', () => {
    it('getPreviousProductTestPhase mirrors getNextProductTestPhase along journey', () => {
        const journey = buildProductTestWizardJourney(PRODUCT_SNAPSHOT);

        let phaseIndex = journey[0].phaseIndex;
        let sectionIndex = journey[0].sectionIndex;

        for (let i = 0; i < journey.length - 1; i += 1) {
            const next = getNextProductTestPhase(PRODUCT_SNAPSHOT, phaseIndex, sectionIndex, journey);
            expect(next.type).toBe('section');
            if (next.type !== 'section') break;

            const previous = getPreviousProductTestPhase(
                PRODUCT_SNAPSHOT,
                next.phaseIndex,
                next.sectionIndex,
                journey,
            );
            expect(previous).toEqual({
                type: 'section',
                phaseIndex,
                sectionIndex,
            });

            phaseIndex = next.phaseIndex;
            sectionIndex = next.sectionIndex;
        }
    });

    it('back button reverses forward wizard steps without extra network assumptions', () => {
        const journey = buildProductTestWizardJourney(PRODUCT_SNAPSHOT);
        const forwardCursors = walkProductTestForward(journey);
        expect(forwardCursors.length).toBeGreaterThan(1);

        let cursor = forwardCursors[forwardCursors.length - 1];
        const reversed: typeof forwardCursors = [cursor];

        for (let guard = 0; guard < 20; guard += 1) {
            const backAdvance = advanceProductTestNavigation(PRODUCT_SNAPSHOT, cursor, 'back', journey);
            if (backAdvance.type === 'boundary') break;
            const next = applyProductTestNavigationAdvance(cursor, backAdvance);
            if (!next) break;
            cursor = next;
            reversed.push(cursor);
        }

        expect(reversed.length).toBeGreaterThan(1);
        expect(reversed[reversed.length - 1].wizardMode).toBe('intro');
    });

    it('round-trip forward then back restores starting cursor', () => {
        const journey = buildProductTestWizardJourney(PRODUCT_SNAPSHOT);
        const start = { phaseIndex: journey[0].phaseIndex, sectionIndex: journey[0].sectionIndex, wizardMode: 'intro' as const };
        let cursor = start;

        const forwardSteps = [cursor];
        for (let i = 0; i < 3; i += 1) {
            const advance = advanceProductTestNavigation(PRODUCT_SNAPSHOT, cursor, 'forward', journey);
            if (advance.type === 'complete') break;
            const next = applyProductTestNavigationAdvance(cursor, advance);
            if (!next) break;
            cursor = next;
            forwardSteps.push(cursor);
        }

        for (let i = forwardSteps.length - 1; i > 0; i -= 1) {
            const backAdvance = advanceProductTestNavigation(PRODUCT_SNAPSHOT, cursor, 'back', journey);
            if (backAdvance.type === 'boundary') break;
            const next = applyProductTestNavigationAdvance(cursor, backAdvance);
            if (!next) break;
            cursor = next;
        }

        expect(cursor.phaseIndex).toBe(start.phaseIndex);
        expect(cursor.sectionIndex).toBe(start.sectionIndex);
    });
});

describe('respondent session persistence on navigation', () => {
    it('follow-up suspend plan does not imply answer deletion', () => {
        const answers = { BrandA_q1: { text: 'sweet\n\nAI Follow-up: Why?\nRespondent: creamy' } };
        const followUpStateMap: FollowUpStateMap = {
            BrandA_q1: {
                questionId: 'BrandA_q1',
                round: 1,
                followUpText: 'Why?',
                loading: false,
                quality: null,
            },
        };

        const plan = buildFollowUpNavigationSuspendPlan(['BrandA_q1'], followUpStateMap);
        expect(plan.suspendKeys).toEqual(['BrandA_q1']);
        expect(answers.BrandA_q1).toMatchObject({ text: expect.stringContaining('AI Follow-up') });
    });

    it('product test answers object is unchanged by navigation cursor updates', () => {
        const answers = { pt_q01: 4, pt_q08: 2 };
        const journey = buildProductTestWizardJourney(PRODUCT_SNAPSHOT);
        let cursor = {
            phaseIndex: journey[0].phaseIndex,
            sectionIndex: journey[0].sectionIndex,
            wizardMode: 'section' as const,
        };

        const backAdvance = advanceProductTestNavigation(PRODUCT_SNAPSHOT, cursor, 'back', journey);
        const nextCursor = applyProductTestNavigationAdvance(cursor, backAdvance);
        if (nextCursor) cursor = nextCursor;

        expect(answers).toEqual({ pt_q01: 4, pt_q08: 2 });
        expect(cursor.wizardMode).toBe('intro');
    });
});
