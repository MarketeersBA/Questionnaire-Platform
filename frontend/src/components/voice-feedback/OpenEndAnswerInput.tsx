import { Mic, CheckCircle2, Send } from 'lucide-react';
import AudioRecorder from './AudioRecorder';
import {
    normalizeOpenEndAnswer,
    updateOpenEndText,
    updateOpenEndVoice,
    type OpenEndAnswer,
} from '../../utils/voiceQuestions';

interface Props {
    value: unknown;
    onChange: (next: OpenEndAnswer) => void;
    publicToken?: string;
    questionId: string;
    brandName?: string;
    questionText?: string;
    language?: 'en' | 'ar';
    showVoice: boolean;
    onBlur?: (text: string) => void;
    /**
     * Send the answer. When provided, a send button is rendered inside the
     * field and becomes the only way the answer is submitted — there is no
     * idle timer and no submit-on-blur behind it.
     */
    onSubmit?: (text: string) => void;
    /** Suppresses the button while a previous answer is still being processed. */
    submitBusy?: boolean;
}

export default function OpenEndAnswerInput({
    value,
    onChange,
    publicToken,
    questionId,
    brandName,
    questionText,
    language = 'en',
    showVoice,
    onBlur,
    onSubmit,
    submitBusy = false,
}: Props) {
    const answer = normalizeOpenEndAnswer(value);
    const isAr = language === 'ar';
    const hasVoice = Boolean(answer.voice_feedback_id);
    const text = answer.text || '';

    return (
        <div className="space-y-3">
            {/* One row: the text and the send control share a line, the way a
                chat composer does. The border is on this wrapper rather than
                the textarea — a textarea's box ends where its rows end, so a
                button placed against it always fell outside the outline.
                `items-end` keeps the button on the baseline as the text grows. */}
            <div className="flex items-end gap-2 rounded-2xl border-2 border-line/80 dark:border-line/10 bg-surface-raised/50 px-3 py-2 transition-colors focus-within:border-primary/60">
                <textarea
                    rows={2}
                    className="flex-1 min-w-0 bg-transparent border-0 px-1 py-1.5 text-sm font-semibold resize-none outline-none focus:ring-0"
                    placeholder={isAr ? 'اكتب إجابتك هنا...' : 'Type your answer...'}
                    value={text}
                    onChange={(e) => onChange(updateOpenEndText(value, e.target.value))}
                    onBlur={(e) => onBlur?.(e.target.value)}
                />

                {onSubmit && (
                    <button
                        type="button"
                        onClick={() => onSubmit(text)}
                        disabled={!text.trim() || submitBusy}
                        aria-label={isAr ? 'إرسال' : 'Send'}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-sm font-black tracking-wide shadow-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4" />
                        {isAr ? 'إرسال' : 'Send'}
                    </button>
                )}
            </div>

            {showVoice && (
                <div className="space-y-3">
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                        <span className="flex items-center gap-1.5">
                            <Mic size={12} />
                            {isAr ? 'أو سجّل صوتياً' : 'Or record your answer'}
                        </span>
                        <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>

                    {hasVoice && (
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                {isAr ? 'تم حفظ التسجيل الصوتي' : 'Voice recording saved'}
                            </p>
                        </div>
                    )}

                    <AudioRecorder
                        compact={hasVoice}
                        publicToken={publicToken}
                        questionId={questionId}
                        brandName={brandName}
                        questionText={questionText}
                        language={language}
                        onUploadSuccess={(feedbackId) => onChange(updateOpenEndVoice(value, feedbackId))}
                    />
                </div>
            )}
        </div>
    );
}
