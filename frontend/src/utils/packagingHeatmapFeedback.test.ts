import { describe, expect, it } from 'vitest';
import {
    buildHeatmapPinFollowUpKey,
    findFirstIncompleteHeatmapPin,
    heatmapIntentToSentiment,
    isHeatmapAnswerComplete,
    parseHeatmapPinFollowUpKey,
    upsertHeatmapClickFeedback,
} from './packagingHeatmapFeedback';
import type { PackagingHeatmapAnswer } from '../types/productTest';

const baseAnswer: PackagingHeatmapAnswer = {
    image_side: 'front',
    intent: 'attraction',
    ref_width: 800,
    ref_height: 600,
    regions: [],
    clicks: [
        {
            x: 0.25,
            y: 0.5,
            ts: 1,
            feedback: { sentiment: 'like', comment: 'I like this color', follow_up_requested: true },
        },
    ],
};

describe('packagingHeatmapFeedback', () => {
    it('creates and parses pin-scoped follow-up keys', () => {
        expect(buildHeatmapPinFollowUpKey('hm_q1', 2)).toBe('hm_q1__pin_3');
        expect(parseHeatmapPinFollowUpKey('hm_q1__pin_3')).toEqual({
            questionId: 'hm_q1',
            pinIndex: 2,
        });
        expect(parseHeatmapPinFollowUpKey('hm_q1')).toBeNull();
    });

    it('maps heatmap intents to feedback sentiment', () => {
        expect(heatmapIntentToSentiment('attraction')).toBe('like');
        expect(heatmapIntentToSentiment('dislikes')).toBe('dislike');
        expect(heatmapIntentToSentiment('improve')).toBe('recommend');
    });

    it('requires every pin to have text or voice feedback', () => {
        expect(isHeatmapAnswerComplete(baseAnswer)).toBe(true);
        expect(
            isHeatmapAnswerComplete({
                ...baseAnswer,
                clicks: [{ x: 0.1, y: 0.2, ts: 1 }],
            }),
        ).toBe(false);
        expect(
            isHeatmapAnswerComplete({
                ...baseAnswer,
                clicks: [{ x: 0.1, y: 0.2, ts: 1, feedback: { sentiment: 'like', voice_note_asset_id: 'asset1' } }],
            }),
        ).toBe(true);
    });

    it('requires follow-up attempts only when requested by validation options', () => {
        const answer = {
            ...baseAnswer,
            clicks: [{ x: 0.1, y: 0.2, ts: 1, feedback: { sentiment: 'like' as const, comment: 'nice logo' } }],
        };
        expect(isHeatmapAnswerComplete(answer)).toBe(true);
        expect(isHeatmapAnswerComplete(answer, { requireFollowUp: true })).toBe(false);
        expect(findFirstIncompleteHeatmapPin(answer, { requireFollowUp: true })).toBe(0);
    });

    it('upserts feedback while preserving coordinates', () => {
        const next = upsertHeatmapClickFeedback({ x: 0.4, y: 0.6 }, 'improve', {
            comment: 'make it clearer',
            follow_up_requested: true,
        });
        expect(next).toEqual({
            x: 0.4,
            y: 0.6,
            feedback: {
                sentiment: 'recommend',
                comment: 'make it clearer',
                follow_up_requested: true,
            },
        });
    });
});
