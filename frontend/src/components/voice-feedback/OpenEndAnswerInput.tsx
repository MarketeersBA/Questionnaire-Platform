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
}: Props) {
    const answer = normalizeOpenEndAnswer(value);
    const isAr = language === 'ar';
    const hasVoice = Boolean(answer.voice_feedback_id);

    return (
        <div className="space-y-5">
            <textarea
                rows={4}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-[2rem] px-8 py-6 text-lg font-bold"
                placeholder={isAr ? 'اكتب إجابتك هنا...' : 'Type your answer...'}
                value={answer.text || ''}
                onChange={(e) => onChange(updateOpenEndText(value, e.target.value))}
                onBlur={(e) => onBlur?.(e.target.value)}
            />

            {showVoice && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                        <span className="flex items-center gap-1.5">
                            <Mic size={12} />
                            {isAr ? 'أو سجّل صوتياً' : 'Or record your answer'}
                        </span>
                        <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>

                    {hasVoice && (
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
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
