import { describe, it, expect } from 'vitest';
import {
    MIN_FOLLOWUP_ANSWER_LENGTH,
    MIN_FOLLOWUP_REPLY_LENGTH,
    isFollowUpAnswerEligible,
    isFollowUpReplyEligible,
} from './aiFollowup';

/**
 * A reply to a follow-up question was held to the same five-character minimum
 * as the first answer, so "اه" and "لا" — direct answers to a direct probe —
 * were discarded without a word. The respondent typed, nothing happened, and
 * the conversation stalled with the question still on screen.
 */
describe('replying to a follow-up question', () => {
    it.each(['اه', 'لا', 'نعم', 'yes', 'no', 'مر'])('accepts %s', (text) => {
        expect(isFollowUpReplyEligible(text)).toBe(true);
    });

    it.each(['', '   ', '\n'])('still rejects empty input %o', (text) => {
        expect(isFollowUpReplyEligible(text)).toBe(false);
    });

    it('is more permissive than the first-answer gate, deliberately', () => {
        expect(MIN_FOLLOWUP_REPLY_LENGTH).toBeLessThan(MIN_FOLLOWUP_ANSWER_LENGTH);
        // The exact answers from the report: rejected as an opener, fine as a reply.
        for (const text of ['اه', 'لا']) {
            expect(isFollowUpAnswerEligible(text)).toBe(false);
            expect(isFollowUpReplyEligible(text)).toBe(true);
        }
    });

    it('leaves the first-answer gate untouched', () => {
        expect(MIN_FOLLOWUP_ANSWER_LENGTH).toBe(5);
        expect(isFollowUpAnswerEligible('المرارة')).toBe(true);
    });
});
