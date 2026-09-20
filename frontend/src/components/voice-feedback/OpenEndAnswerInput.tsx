import type { ReactNode } from 'react';
import { Mic, CheckCircle2 } from 'lucide-react';
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
     * Rendered inside the input box, pinned to its bottom trailing corner.
     * Sits within the field rather than under it so the action reads as part
     * of the answer, the way a chat composer does.
     */
    action?: ReactNode;
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
    action,
}: Props) {
    const answer = normalizeOpenEndAnswer(value);
    const isAr = language === 'ar';
    const hasVoice = Boolean(answer.voice_feedback_id);

    return (
        <div className="space-y-3">
            <div className="relative">
                <textarea
                    rows={2}
                    // Extra bottom padding keeps the last line of text clear of
                    // the action pinned inside the field.
                    className={`w-full bg-surface-raised/50 border-2 border-line/80 dark:border-line/10 rounded-2xl px-4 pt-3 text-sm font-semibold resize-none ${
                        action ? 'pb-14' : 'pb-3'
                    }`}
                    placeholder={isAr ? 'اكتب إجابتك هنا...' : 'Type your answer...'}
                    value={answer.text || ''}
                    onChange={(e) => onChange(updateOpenEndText(value, e.target.value))}
                    onBlur={(e) => onBlur?.(e.target.value)}
                />

                {action && (
                    // Logical inset: the trailing corner is the left in Arabic and
                    // the right in English, without branching on language.
                    <div
                        className="absolute bottom-3"
                        style={{ insetInlineEnd: '0.75rem' }}
                    >
                        {action}
                    </div>
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
