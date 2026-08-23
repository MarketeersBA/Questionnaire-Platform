import { motion } from 'framer-motion';
import { normalizeOpenEndAnswer } from '../../utils/voiceQuestions';
import AiFollowUpPanel from '../voice-feedback/AiFollowUpPanel';
import { toast } from 'sonner';
import type { ProductTestRespondentQuestion, ProductTestRespondentSection } from '../../types/productTestRespondent';
import { resolveProductTestDisplayText } from '../../utils/productTestPlaceholderEngine';
import type { ProductTestRespondentDisplayContext } from '../../utils/productTestRespondentDisplay';
import { resolveProductTestVoiceBrandName } from '../../utils/productTestRespondentDisplay';
import type { VoiceCaptureConfig } from '../../utils/voiceQuestions';
import { isVoiceEnabledForProductTestQuestion } from '../../utils/voiceQuestions';
import OpenEndAnswerWithFollowUpThread from '../voice-feedback/OpenEndAnswerWithFollowUpThread';
import type { FollowUpEligibilityInput, FollowUpReplyChangeHandler, FollowUpStateMap, FollowUpTriggerHandler, VoiceFollowUpTriggerHandler } from '../../utils/aiFollowup';
import { classifyQuestionCategory, getMaxFollowUpRounds, isFollowUpAnswerEligible, isAiFollowUpEligible, shouldTriggerInitialFollowUp, canSubmitFollowUpReply, isFollowUpResponsePending } from '../../utils/aiFollowup';
import { resolveMinAnswerLength } from '../../utils/aiFollowupConfig';
import {
  appendFollowUpExchangeToOpenEndValue,
  appendFollowUpExchangeToText,
  FOLLOWUP_VOICE_REPLY_PLACEHOLDER,
} from '../../utils/followUpAnswerPersistence';
import PackagingHeatmapQuestion from './PackagingHeatmapQuestion';
import ProductTestMediaUploadQuestion from './ProductTestMediaUploadQuestion';
import ScaleAnchorLabels from '../respondent/ScaleAnchorLabels';
import HorizontalScaleSlider from '../respondent/HorizontalScaleSlider';

interface ProductTestQuestionRendererProps {
    question: ProductTestRespondentQuestion;
    section: ProductTestRespondentSection;
    value: unknown;
    onChange: (next: unknown) => void;
    language: 'en' | 'ar';
    display: ProductTestRespondentDisplayContext;
    publicToken?: string;
    voiceCapture?: VoiceCaptureConfig | null;
    pulseError?: boolean;
    aiFollowup?: any;
    onFollowUpTrigger?: FollowUpTriggerHandler;
    onVoiceFollowUpTrigger?: VoiceFollowUpTriggerHandler;
    followUpStateMap?: FollowUpStateMap;
    onFollowUpReplyChange?: FollowUpReplyChangeHandler;
    onFollowUpDismiss?: (questionIds: string[]) => void;
}

export default function ProductTestQuestionRenderer({
    question,
    section,
    value,
    onChange,
    language,
    display,
    publicToken,
    voiceCapture,
    pulseError = false,
    aiFollowup,
    onFollowUpTrigger,
    onVoiceFollowUpTrigger,
    followUpStateMap,
    onFollowUpReplyChange,
    onFollowUpDismiss,
}: ProductTestQuestionRendererProps) {
    const isArabic = language === 'ar';
    const scaleMax = question.questionMeta?.scaleMax || 5;
    const minLabel = question.questionMeta?.minLabel;
    const maxLabel = question.questionMeta?.maxLabel;
    const showVoice = isVoiceEnabledForProductTestQuestion(
        { voice_capture: voiceCapture },
        question.type,
        question.timing,
    );

    const displayText = resolveProductTestDisplayText(question.text, {
        brand: section.brand || question.brand,
        displayBrand: section.displayBrand || question.displayBrand,
        category: display.category,
        attribute: section.title,
        language,
        testing_protocol: display.testing_protocol,
        blind_codes: display.blind_codes,
        brands: display.brands,
    });

    const voiceBrandName = resolveProductTestVoiceBrandName(section.brand || question.brand, display);

    const openEndFollowUpEligibility: FollowUpEligibilityInput = {
        surface: 'product_test_open_end',
        questionText: displayText,
        effectiveType: question.type,
    };
    const heatmapFollowUpEligibility: FollowUpEligibilityInput = {
        surface: 'product_test_heatmap_point_comment',
        questionText: displayText,
    };
    const openEndFollowUpEligible = isAiFollowUpEligible(openEndFollowUpEligibility, aiFollowup);
    const heatmapFollowUpEligible = isAiFollowUpEligible(heatmapFollowUpEligibility, aiFollowup);
    const minAnswerLength = resolveMinAnswerLength(aiFollowup);
    const followUpEligible = question.type === 'packaging-heatmap'
        ? heatmapFollowUpEligible
        : openEndFollowUpEligible;
    const activeFollowUpEligibility = question.type === 'packaging-heatmap'
        ? heatmapFollowUpEligibility
        : openEndFollowUpEligibility;

    const cardClass = `p-4 md:p-5 rounded-2xl bg-surface border overflow-visible transition-all shadow-sm ${pulseError
        ? 'border-rose-400 ring-4 ring-rose-500/30 animate-pulse'
        : 'border-line/80 dark:border-line/10 hover:shadow-md'
        }`;

    return (
        <motion.div
            id={`pt-q-${question.id}`}
            layout
            className={cardClass}
        >
            <div className="flex justify-between items-start gap-3 mb-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-base md:text-lg font-bold text-ink leading-snug">
                        {displayText}
                    </p>
                    {question.diagnostic_tag && (
                        <span className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-surface-sunken text-slate-500">
                            {question.diagnostic_tag}
                        </span>
                    )}
                </div>
                {question.type === 'scale' && value != null && value !== '' && (
                    <div className="shrink-0 px-2.5 py-1 bg-primary text-white rounded-lg font-black text-sm min-w-[2rem] text-center shadow-md">
                        {String(value)}
                    </div>
                )}
            </div>

            {question.type === 'scale' ? (
                <div className="pt-1">
                    <HorizontalScaleSlider
                        value={Number(value) || 1}
                        max={scaleMax}
                        onChange={(nextValue) => onChange(nextValue)}
                        language={language}
                        minLabel={minLabel}
                        maxLabel={maxLabel}
                        size="large"
                        pulseError={pulseError}
                    />
                </div>
            ) : question.type === 'bipolar' ? (
                <div className="space-y-4">
                    <ScaleAnchorLabels
                        language={language}
                        variant="bipolar"
                        minLabel={minLabel}
                        maxLabel={maxLabel}
                        leftLabel={question.questionMeta?.bipolarLeft}
                        rightLabel={question.questionMeta?.bipolarRight}
                    />
                    <div className="flex flex-wrap gap-2 justify-center">
                        {[...Array(scaleMax)].map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => onChange(i + 1)}
                                className={`w-11 h-11 rounded-xl border font-black transition-all ${value === i + 1
                                    ? 'bg-primary text-white border-primary scale-110'
                                    : 'bg-surface-raised border-slate-200 text-slate-500'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                </div>
            ) : question.type === 'number' || question.type === 'numeric' ? (
                <input
                    type="number"
                    value={value != null ? String(value) : ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-surface-raised border-2 border-line/80 dark:border-line/10 rounded-2xl px-6 py-4 text-xl font-bold"
                    placeholder={isArabic ? 'أدخل رقماً...' : 'Enter a number...'}
                />
            ) : question.type === 'mcq' ? (
                <div className="grid grid-cols-1 gap-2">
                    {question.options?.map((opt) => (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => onChange(opt)}
                            className={`w-full p-4 rounded-2xl border-2 text-left font-semibold transition-all ${value === opt
                                ? 'bg-primary/10 border-primary text-primary-soft shadow-sm'
                                : 'bg-surface-raised/50 border-slate-100 text-ink-muted hover:border-slate-300'
                                }`}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            ) : question.type === 'media-upload' ? (
                <ProductTestMediaUploadQuestion
                    question={question}
                    value={value}
                    onChange={onChange}
                    language={language}
                    publicToken={publicToken}
                    pulseError={pulseError}
                />
            ) : question.type === 'packaging-heatmap' ? (
                <>
                    <PackagingHeatmapQuestion
                        question={question}
                        value={value}
                        onChange={onChange}
                        language={language}
                        publicToken={publicToken}
                        pulseError={pulseError}
                        aiFollowup={aiFollowup}
                        followUpStateMap={followUpStateMap}
                        onFollowUpTrigger={onFollowUpTrigger}
                        onVoiceFollowUpTrigger={onVoiceFollowUpTrigger}
                        onFollowUpReplyChange={onFollowUpReplyChange}
                        onFollowUpDismiss={onFollowUpDismiss}
                        followUpEligibility={heatmapFollowUpEligibility}
                        brandName={voiceBrandName || ''}
                        showFollowUpVoice={showVoice}
                        maxFollowUpRounds={getMaxFollowUpRounds(aiFollowup, classifyQuestionCategory(displayText))}
                    />
                </>
            ) : (
                <OpenEndAnswerWithFollowUpThread
                    value={value}
                    onChange={(next) => {
                        const prev = normalizeOpenEndAnswer(value);
                        onChange(next);
                        const nextNormalized = normalizeOpenEndAnswer(next);
                        if (aiFollowup?.is_enabled && onVoiceFollowUpTrigger && openEndFollowUpEligible) {
                            if (aiFollowup?.apply_to_voice && !prev.voice_feedback_id && nextNormalized.voice_feedback_id) {
                                if (followUpStateMap && shouldTriggerInitialFollowUp(question.id, followUpStateMap)) {
                                    onVoiceFollowUpTrigger(question.id, nextNormalized.voice_feedback_id, displayText, voiceBrandName || '', openEndFollowUpEligibility);
                                }
                            }
                        }
                    }}
                    showVoice={showVoice}
                    publicToken={publicToken}
                    questionId={question.id}
                    brandName={voiceBrandName}
                    questionText={displayText}
                    language={language}
                    onBlur={(text) => {
                        if (followUpStateMap && !shouldTriggerInitialFollowUp(question.id, followUpStateMap)) return;
                        if (aiFollowup?.is_enabled && aiFollowup?.apply_to_text && onFollowUpTrigger && openEndFollowUpEligible) {
                            if (isFollowUpAnswerEligible(text, minAnswerLength)) {
                                onFollowUpTrigger(question.id, text, displayText, voiceBrandName || '', 'text', openEndFollowUpEligibility);
                            }
                        }
                    }}
                />
            )}

            {question.type !== 'packaging-heatmap' && followUpEligible && (
            <AiFollowUpPanel
                visible={isFollowUpResponsePending(followUpStateMap?.[question.id])}
                state={followUpStateMap?.[question.id] ?? { questionId: null, round: 1, followUpText: null, loading: false, quality: null }}
                language={language}
                maxRounds={getMaxFollowUpRounds(aiFollowup, classifyQuestionCategory(displayText))}
                variant="standard"
                showVoice={showVoice}
                publicToken={publicToken}
                replyQuestionId={`followup-${question.id}-${followUpStateMap?.[question.id]?.round ?? 1}`}
                brandName={voiceBrandName}
                followUpQuestionText={followUpStateMap?.[question.id]?.followUpText ?? null}
                onReplyChange={(replyValue) => onFollowUpReplyChange?.(question.id, replyValue)}
                onReplyTextSubmit={(text) => {
                    if (!aiFollowup?.apply_to_text || !isFollowUpAnswerEligible(text, minAnswerLength) || !onFollowUpTrigger) return;
                    if (followUpStateMap && !canSubmitFollowUpReply(followUpStateMap[question.id])) return;
                    if (question.type === 'packaging-heatmap') {
                        const heatmapVal = value as Record<string, unknown>;
                        const updatedVal = {
                            ...heatmapVal,
                            overall_comment: appendFollowUpExchangeToText(
                                (heatmapVal.overall_comment as string) || '',
                                followUpStateMap?.[question.id]?.followUpText,
                                text,
                            ),
                        };
                        onChange(updatedVal);
                    } else {
                        onChange(appendFollowUpExchangeToOpenEndValue(
                            value,
                            followUpStateMap?.[question.id]?.followUpText,
                            text,
                        ));
                    }
                    onFollowUpTrigger(question.id, text, displayText, voiceBrandName || '', 'text', activeFollowUpEligibility);
                }}
                onReplyVoiceUpload={(feedbackId) => {
                    if (!aiFollowup?.apply_to_voice || !onVoiceFollowUpTrigger) return;
                    toast.success(isArabic ? 'تم حفظ التسجيل' : 'Recording saved');
                    if (question.type !== 'packaging-heatmap') {
                        onChange(appendFollowUpExchangeToOpenEndValue(
                            value,
                            followUpStateMap?.[question.id]?.followUpText,
                            FOLLOWUP_VOICE_REPLY_PLACEHOLDER,
                        ));
                    }
                    onVoiceFollowUpTrigger(question.id, feedbackId, displayText, voiceBrandName || '', activeFollowUpEligibility);
                }}
            />
            )}
        </motion.div>
    );
}
