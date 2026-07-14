export type VoiceCaptureConfig = {
    is_enabled: boolean;
    mode: 'text_only' | 'text_and_voice';
    target_questions: 'after_taste_open_ends';
    ai_analysis_enabled: boolean;
    transcription_language?: 'auto' | 'en' | 'ar';
};

export type OpenEndAnswer = {
    text?: string;
    voice_feedback_id?: string;
    input_modes_used: ('text' | 'voice')[];
};

export const DEFAULT_VOICE_CAPTURE: VoiceCaptureConfig = {
    is_enabled: false,
    mode: 'text_only',
    target_questions: 'after_taste_open_ends',
    ai_analysis_enabled: false,
    transcription_language: 'auto',
};

/** Whether this open-ended question is eligible for optional voice capture */
export function isVoiceEligibleQuestion(q: any, section: any, effectiveType: string): boolean {
    if (effectiveType !== 'open-ended' && effectiveType !== 'text') return false;
    if (q.timing === 'After Taste') return true;
    const title = (section?.title || '').toLowerCase();
    return title.includes('general evaluation') || title.includes('تقييم عام');
}

/** Whether voice recorder should appear for product test open-ended questions */
export function isVoiceEnabledForProductTestQuestion(
    survey: { voice_capture?: VoiceCaptureConfig | null } | null | undefined,
    effectiveType: string,
    timing?: string,
): boolean {
    const cfg = survey?.voice_capture ?? DEFAULT_VOICE_CAPTURE;
    if (!cfg.is_enabled || cfg.mode !== 'text_and_voice') return false;
    if (effectiveType !== 'open-ended' && effectiveType !== 'text') return false;
    return timing === 'after_use' || timing === 'during_use' || timing === 'packaging';
}

/** Whether voice recorder should appear on module open-ended questions */
export function isVoiceEnabledForModuleOpenQuestion(
    voiceCapture?: VoiceCaptureConfig | null,
): boolean {
    const cfg = voiceCapture ?? DEFAULT_VOICE_CAPTURE;
    return cfg.is_enabled && cfg.mode === 'text_and_voice';
}

/** Whether voice recorder should appear for this question on the public survey */
export function isVoiceEnabledForQuestion(
    survey: { voice_capture?: VoiceCaptureConfig | null } | null | undefined,
    q: any,
    section: any,
    effectiveType: string
): boolean {
    const cfg = survey?.voice_capture ?? DEFAULT_VOICE_CAPTURE;
    if (!cfg.is_enabled || cfg.mode !== 'text_and_voice') return false;
    if (cfg.target_questions !== 'after_taste_open_ends') return false;
    return isVoiceEligibleQuestion(q, section, effectiveType);
}

export function emptyOpenEndAnswer(): OpenEndAnswer {
    return { text: '', input_modes_used: [] };
}

export function normalizeOpenEndAnswer(value: unknown): OpenEndAnswer {
    if (value == null || value === '') return emptyOpenEndAnswer();
    if (typeof value === 'string') {
        if (value.startsWith('voice:')) {
            return {
                voice_feedback_id: value.slice(6),
                input_modes_used: ['voice'],
            };
        }
        return { text: value, input_modes_used: value.trim() ? ['text'] : [] };
    }
    if (typeof value === 'object' && value !== null) {
        const v = value as Partial<OpenEndAnswer>;
        const modes = new Set<'text' | 'voice'>(v.input_modes_used || []);
        if (v.text?.trim()) modes.add('text');
        if (v.voice_feedback_id) modes.add('voice');
        return {
            text: v.text || '',
            voice_feedback_id: v.voice_feedback_id,
            input_modes_used: Array.from(modes),
        };
    }
    return emptyOpenEndAnswer();
}

export function isOpenEndAnswerComplete(value: unknown): boolean {
    const ans = normalizeOpenEndAnswer(value);
    return Boolean(ans.text?.trim()) || Boolean(ans.voice_feedback_id);
}

export function updateOpenEndText(current: unknown, text: string): OpenEndAnswer {
    const ans = normalizeOpenEndAnswer(current);
    const modes = new Set(ans.input_modes_used);
    if (text.trim()) modes.add('text');
    else modes.delete('text');
    return { ...ans, text, input_modes_used: Array.from(modes) };
}

export function updateOpenEndVoice(current: unknown, feedbackId: string): OpenEndAnswer {
    const ans = normalizeOpenEndAnswer(current);
    const modes = new Set(ans.input_modes_used);
    modes.add('voice');
    return {
        ...ans,
        voice_feedback_id: feedbackId,
        input_modes_used: Array.from(modes),
    };
}

/** Flat export value: prefer text, fall back to voice marker */
export function flattenOpenEndValue(value: unknown): string {
    const ans = normalizeOpenEndAnswer(value);
    if (ans.text?.trim()) return ans.text.trim();
    if (ans.voice_feedback_id) return `[voice:${ans.voice_feedback_id}]`;
    return '';
}
