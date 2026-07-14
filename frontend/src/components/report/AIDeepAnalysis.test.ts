import { describe, expect, it } from 'vitest';
import {
    getRecommendedActionDisplay,
    shouldShowRecommendedAction,
} from './aidDeepAnalysisDisplay';

describe('AIDeepAnalysis recommended_action display (Phase 8)', () => {
    it('shows action when recommended_action is a non-empty string', () => {
        expect(getRecommendedActionDisplay('Scale trial sampling in Cairo retail.')).toBe(
            'Scale trial sampling in Cairo retail.',
        );
        expect(
            shouldShowRecommendedAction({
                title: 'Intent Gap',
                body: 'Squizz over-indexes.',
                sentiment: 'positive',
                recommended_action: 'Scale trial sampling in Cairo retail.',
            }),
        ).toBe(true);
    });

    it('hides action when recommended_action is missing or blank', () => {
        expect(getRecommendedActionDisplay(undefined)).toBeNull();
        expect(getRecommendedActionDisplay('   ')).toBeNull();
        expect(
            shouldShowRecommendedAction({
                title: 'Legacy insight',
                body: 'No action field.',
                sentiment: 'neutral',
            }),
        ).toBe(false);
    });
});
