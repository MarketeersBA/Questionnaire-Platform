import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import OpenEndAnswerInput from './OpenEndAnswerInput';
import type { FollowUpPanelState } from '../../utils/aiFollowup';
import { normalizeOpenEndAnswer } from '../../utils/voiceQuestions';

// There is deliberately no idle timer here.
//
// Replies used to be sent after a pause in typing, which guessed at when a
// respondent had finished. It guessed wrong in both directions: it fired
// mid-thought on someone typing slowly, and it left someone who had finished
// staring at the screen wondering whether anything had registered. Sending is
// now an explicit act — the respondent decides when the answer is done.

export type AiFollowUpPanelVariant = 'premium' | 'standard';

export interface AiFollowUpPanelProps {
    visible: boolean;
    state: FollowUpPanelState;
    language: 'en' | 'ar';
    maxRounds?: number;
    variant?: AiFollowUpPanelVariant;
    title?: string;
    /** Reply input — voice + text */
    showVoice: boolean;
    publicToken?: string;
    replyQuestionId: string;
    brandName?: string;
    followUpQuestionText?: string | null;
    onReplyChange: (value: unknown) => void;
    onReplyTextSubmit: (text: string) => void;
    onReplyVoiceUpload?: (feedbackId: string) => void;
}

const COPY = {
    en: {
        titlePremium: 'AI Researcher',
        titleStandard: 'AI Research Prober',
        subtitlePremium: 'In-depth moderation active',
        subtitleStandard: 'In-depth moderation activated',
        loadingPremium: 'Analyzing & composing...',
        loadingStandard: 'Analyzing your response...',
        send: 'Send',
    },
    ar: {
        titlePremium: 'الباحث الذكي',
        titleStandard: 'المحقق الذكي',
        subtitlePremium: 'الإشراف المعمق نشط',
        subtitleStandard: 'الإشراف المعمق مُفعّل',
        loadingPremium: 'الباحث يحلل إجابتك...',
        loadingStandard: 'جاري تحليل إجابتك...',
        send: 'إرسال',
    },
} as const;

export default function AiFollowUpPanel({
    visible,
    state,
    language,
    maxRounds,
    variant = 'standard',
    title,
    showVoice,
    publicToken,
    replyQuestionId,
    brandName,
    followUpQuestionText,
    onReplyChange,
    onReplyTextSubmit,
    onReplyVoiceUpload,
}: AiFollowUpPanelProps) {
    const replyText = normalizeOpenEndAnswer(state.replyValue).text || '';
    const onReplyTextSubmitRef = useRef(onReplyTextSubmit);
    onReplyTextSubmitRef.current = onReplyTextSubmit;

    // Guards a double tap on Send: two sends of the same text would burn a
    // probe round and leave the respondent answering a question twice.
    const lastSubmittedRef = useRef<string | null>(null);

    const submitReply = useCallback(() => {
        const text = replyText.trim();
        if (!text || lastSubmittedRef.current === text) return;
        lastSubmittedRef.current = text;
        onReplyTextSubmitRef.current(replyText);
    }, [replyText]);

    // A new question means a new answer: allow the same word again ("اه" twice
    // in a row is two distinct answers to two distinct probes).
    useEffect(() => {
        lastSubmittedRef.current = null;
    }, [state.followUpText]);

    if (!visible) return null;

    // After AI completes / rounds exhaust, map entry can linger with no content — don't show an empty shell.
    if (!state.loading && !state.followUpText) return null;

    const copy = COPY[language];
    const isPremium = variant === 'premium';
    const panelTitle = title ?? (isPremium ? copy.titlePremium : copy.titleStandard);
    const subtitle = isPremium ? copy.subtitlePremium : copy.subtitleStandard;
    const loadingText = isPremium ? copy.loadingPremium : copy.loadingStandard;

    const containerClass = isPremium
        ? 'mt-4 p-5 bg-gradient-to-tr from-primary/5 to-transparent border-2 border-primary/20 rounded-[1.5rem] relative overflow-hidden shadow-sm'
        : 'mt-4 p-5 bg-primary/5 border-2 border-primary/20 rounded-[1.5rem] relative overflow-hidden';

    return (
        <motion.div
            initial={{ opacity: 0, scale: isPremium ? 0.95 : 1, y: isPremium ? 5 : 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: isPremium ? 0.95 : 1, y: isPremium ? -5 : -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={containerClass}
        >
            <div className={`flex items-center gap-3 ${isPremium ? 'mb-4' : 'mb-3'}`}>
                <div className={`w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white ${isPremium ? 'shadow-md' : ''}`}>
                    <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-[0.15em] text-primary-soft">
                            {panelTitle}
                        </h4>
                        {maxRounds != null && maxRounds > 0 && (
                            <div className="flex gap-1.5 items-center">
                                {Array.from({ length: maxRounds }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                            i < Math.max(0, state.round - 1) ? 'bg-primary scale-110' : 'bg-primary/20'
                                        }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        {subtitle}
                    </p>
                </div>
            </div>

            {state.loading ? (
                isPremium ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-6 space-y-4"
                    >
                        <Loader2 className="w-8 h-8 text-primary-soft animate-spin opacity-80" />
                        <div className="flex gap-2">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                        </div>
                        <p className="text-xs font-bold text-primary-soft animate-pulse uppercase tracking-widest">
                            {loadingText}
                        </p>
                    </motion.div>
                ) : (
                    <div className="flex items-center gap-3 py-4">
                        <Loader2 className="w-5 h-5 text-primary-soft animate-spin" />
                        <p className="text-sm font-bold text-slate-400 animate-pulse uppercase tracking-widest">
                            {loadingText}
                        </p>
                    </div>
                )
            ) : state.followUpText ? (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={isPremium ? 'space-y-6' : 'space-y-4'}
                >
                    <div
                        className={
                            isPremium
                                ? 'p-5 bg-surface rounded-3xl border border-primary/10 shadow-sm relative'
                                : 'p-4 bg-surface rounded-2xl border-2 border-primary/10'
                        }
                    >
                        {isPremium && (
                            <div className="absolute top-0 left-6 -translate-y-1/2 w-4 h-4 bg-surface border-l border-t border-primary/10 rotate-45" />
                        )}
                        <p
                            className={
                                isPremium
                                    ? 'text-[17px] font-bold text-slate-700 dark:text-slate-200 leading-relaxed italic'
                                    : 'text-lg font-bold text-slate-700 dark:text-slate-200 leading-relaxed italic'
                            }
                        >
                            &ldquo;{state.followUpText}&rdquo;
                        </p>
                    </div>

                    <div className="relative group">
                        <OpenEndAnswerInput
                            value={state.replyValue || {}}
                            showVoice={showVoice}
                            publicToken={publicToken}
                            questionId={replyQuestionId}
                            brandName={brandName}
                            questionText={followUpQuestionText || state.followUpText}
                            language={language}
                            onChange={(next) => {
                                onReplyChange(next);
                                const prevId = (state.replyValue as { voice_feedback_id?: string } | undefined)?.voice_feedback_id;
                                if (next.voice_feedback_id && !prevId && onReplyVoiceUpload) {
                                    onReplyVoiceUpload(next.voice_feedback_id);
                                }
                            }}
                            // Sending is the only way a reply leaves this panel.
                            onSubmit={submitReply}
                            submitBusy={state.loading}
                        />
                    </div>
                </motion.div>
            ) : null}
        </motion.div>
    );
}
