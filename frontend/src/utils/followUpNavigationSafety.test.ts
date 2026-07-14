import { describe, expect, it } from 'vitest';
import type { FollowUpStateMap } from './aiFollowup';
import {
    buildFollowUpNavigationSuspendPlan,
    buildTasteTestLeavingPageSuspendPlan,
    collectProductTestSectionFollowUpScopeIds,
    collectTasteTestFollowUpScopeIds,
    expandFollowUpKeysForQuestion,
} from './followUpNavigationSafety';
import { buildHeatmapPinFollowUpKey } from './packagingHeatmapFeedback';
import {
    advanceTasteTestNavigation,
    applyTasteTestNavigationAdvance,
    resolveTasteTestNavigationPosition,
} from './tasteTestRespondentNavigation';
import type { ProductTestRespondentSection } from '../types/productTestRespondent';

const TASTE_SURVEY = {
    customizations: { brands: ['BrandA'] },
    layer2_questions: {
        sections: [
            {
                title: 'BrandA Taste',
                brand: 'BrandA',
                questions: [{ id: 'q_open', text: 'Comments', type: 'open-ended' }],
            },
        ],
    },
};

const MULTI_BRAND_TASTE_SURVEY = {
    customizations: { brands: ['BrandA', 'BrandB'] },
    layer2_questions: {
        sections: [
            {
                title: 'BrandA Taste',
                brand: 'BrandA',
                questions: [
                    {
                        id: 'q_like',
                        text: 'What did you like about the taste?',
                        type: 'open-ended',
                    },
                ],
            },
            {
                title: 'BrandB Taste',
                brand: 'BrandB',
                questions: [
                    {
                        id: 'q_like',
                        text: 'What did you like about the taste?',
                        type: 'open-ended',
                    },
                ],
            },
        ],
    },
};

describe('followUpNavigationSafety', () => {
    it('collectTasteTestFollowUpScopeIds uses L2 answer keys', () => {
        const position = resolveTasteTestNavigationPosition({ brandIndex: 0 }, TASTE_SURVEY);
        expect(collectTasteTestFollowUpScopeIds(TASTE_SURVEY, position)).toEqual(['BrandA_q_open']);
    });

    it('expandFollowUpKeysForQuestion includes heatmap pin keys', () => {
        const map: FollowUpStateMap = {
            pkg_hm: { questionId: 'pkg_hm', round: 1, followUpText: 'Why?', loading: false, quality: null },
            [buildHeatmapPinFollowUpKey('pkg_hm', 0)]: {
                questionId: buildHeatmapPinFollowUpKey('pkg_hm', 0),
                round: 1,
                followUpText: 'Tell me more',
                loading: false,
                quality: null,
            },
            other_q: { questionId: 'other_q', round: 1, followUpText: null, loading: true, quality: null },
        };

        expect(expandFollowUpKeysForQuestion('pkg_hm', map)).toEqual(
            expect.arrayContaining([
                'pkg_hm',
                buildHeatmapPinFollowUpKey('pkg_hm', 0),
            ]),
        );
        expect(expandFollowUpKeysForQuestion('pkg_hm', map)).toHaveLength(2);
    });

    it('buildFollowUpNavigationSuspendPlan lists only keys in leaving scope', () => {
        const map: FollowUpStateMap = {
            q1: { questionId: 'q1', round: 1, followUpText: 'Pending?', loading: false, quality: null },
            q2: { questionId: 'q2', round: 1, followUpText: null, loading: true, quality: null },
        };

        const plan = buildFollowUpNavigationSuspendPlan(['q1'], map);
        expect(plan.suspendKeys).toEqual(['q1']);
    });

    it('forward brand navigation suspends stale follow-up on current page only', () => {
        const brandAPosition = resolveTasteTestNavigationPosition(
            { brandIndex: 0 },
            MULTI_BRAND_TASTE_SURVEY,
        );
        const followUpStateMap: FollowUpStateMap = {
            BrandA_q_like: {
                questionId: 'BrandA_q_like',
                round: 1,
                followUpText: 'Tell me more about the sweetness?',
                loading: false,
                quality: null,
            },
            BrandB_q_like: {
                questionId: 'BrandB_q_like',
                round: 1,
                followUpText: 'What stood out?',
                loading: false,
                quality: null,
            },
        };

        const leavingPlan = buildTasteTestLeavingPageSuspendPlan(
            MULTI_BRAND_TASTE_SURVEY,
            brandAPosition,
            followUpStateMap,
        );
        expect(leavingPlan.suspendKeys).toEqual(['BrandA_q_like']);
        expect(leavingPlan.suspendKeys).not.toContain('BrandB_q_like');

        const forwardAdvance = advanceTasteTestNavigation({ brandIndex: 0 }, MULTI_BRAND_TASTE_SURVEY, 'forward');
        expect(forwardAdvance).toEqual({ type: 'brand', brandIndex: 1 });
        const nextCursor = applyTasteTestNavigationAdvance(forwardAdvance, MULTI_BRAND_TASTE_SURVEY);
        expect(nextCursor).toEqual({ brandIndex: 1 });
    });

    it('forward and back navigation use the same taste-test follow-up scope', () => {
        const position = resolveTasteTestNavigationPosition({ brandIndex: 0 }, TASTE_SURVEY);
        const scopeIds = collectTasteTestFollowUpScopeIds(TASTE_SURVEY, position);
        const map: FollowUpStateMap = {
            BrandA_q_open: {
                questionId: 'BrandA_q_open',
                round: 1,
                followUpText: 'Why?',
                loading: false,
                quality: null,
            },
        };
        const plan = buildFollowUpNavigationSuspendPlan(scopeIds, map);
        expect(plan.scopeQuestionIds).toEqual(['BrandA_q_open']);
        expect(plan.suspendKeys).toEqual(['BrandA_q_open']);
    });

    it('collectProductTestSectionFollowUpScopeIds includes stable heatmap pin keys', () => {
        const section: ProductTestRespondentSection = {
            id: 'packaging_heatmap',
            title: 'Heatmap',
            module: 'packaging_heatmap',
            timing: 'packaging',
            questions: [
                {
                    id: 'pkg_hm',
                    text: 'Tap areas',
                    type: 'packaging-heatmap',
                    options: [],
                    required: true,
                    timing: 'packaging',
                    diagnostic_tag: null,
                    questionMeta: { imageSide: 'front', heatmapIntent: 'attraction' },
                },
            ],
        };

        const answers = {
            pkg_hm: {
                image_side: 'front',
                intent: 'attraction',
                ref_width: 800,
                ref_height: 600,
                regions: [],
                clicks: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
            },
        };

        expect(collectProductTestSectionFollowUpScopeIds(section, answers)).toEqual([
            'pkg_hm',
            buildHeatmapPinFollowUpKey('pkg_hm', 0),
            buildHeatmapPinFollowUpKey('pkg_hm', 1),
        ]);
    });
});
