/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_VOICE_CAPTURE,
    isVoiceEligibleQuestion,
    isVoiceEnabledForQuestion,
    isOpenEndAnswerComplete,
    normalizeOpenEndAnswer,
    updateOpenEndText,
    updateOpenEndVoice,
    flattenOpenEndValue,
} from './voiceQuestions';

describe('voiceQuestions', () => {
    const afterTasteQ = { type: 'open-ended', timing: 'After Taste' };
    const section = { title: 'Brand: General Evaluation' };

    it('detects eligible after-taste open-ended questions', () => {
        expect(isVoiceEligibleQuestion(afterTasteQ, section, 'open-ended')).toBe(true);
    });

    it('gates voice on survey config', () => {
        const enabledSurvey = {
            voice_capture: { ...DEFAULT_VOICE_CAPTURE, is_enabled: true, mode: 'text_and_voice' as const },
        };
        expect(isVoiceEnabledForQuestion(enabledSurvey, afterTasteQ, section, 'open-ended')).toBe(true);
        expect(isVoiceEnabledForQuestion(null, afterTasteQ, section, 'open-ended')).toBe(false);
    });

    it('accepts text-only, voice-only, or both as complete', () => {
        expect(isOpenEndAnswerComplete('hello')).toBe(true);
        expect(isOpenEndAnswerComplete('voice:abc123')).toBe(true);
        expect(isOpenEndAnswerComplete(updateOpenEndVoice(updateOpenEndText('', 'typed'), 'fid'))).toBe(true);
        expect(isOpenEndAnswerComplete('')).toBe(false);
    });

    it('normalizes legacy voice string answers', () => {
        const ans = normalizeOpenEndAnswer('voice:legacy-id');
        expect(ans.voice_feedback_id).toBe('legacy-id');
        expect(ans.input_modes_used).toContain('voice');
    });

    it('flattens structured answers for export', () => {
        expect(flattenOpenEndValue({ text: 'Great taste', voice_feedback_id: 'x' })).toBe('Great taste');
        expect(flattenOpenEndValue({ voice_feedback_id: 'x' })).toBe('[voice:x]');
    });
});
