import { useCallback, useMemo, useRef, useState } from 'react';
import { Loader2, RotateCcw, Crosshair, Heart, X, Wrench, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductTestRespondentQuestion } from '../../types/productTestRespondent';
import type { PackagingHeatmapAnswer, PackagingHeatmapClick } from '../../types/productTest';
import { packagingHeatmap, publicApi } from '../../services/api';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import React from 'react';
import AiFollowUpPanel from '../voice-feedback/AiFollowUpPanel';
import type {
    FollowUpEligibilityInput,
    FollowUpReplyChangeHandler,
    FollowUpStateMap,
    FollowUpTriggerHandler,
    VoiceFollowUpTriggerHandler,
} from '../../utils/aiFollowup';
import {
    appendFollowUpExchangeToText,
} from '../../utils/followUpAnswerPersistence';
import {
    buildHeatmapPinFollowUpKey,
    getHeatmapPinComment,
    hasHeatmapPinVoice,
    heatmapIntentToSentiment,
    isHeatmapPinAiRequested,
    isHeatmapPinFeedbackAnswered,
    upsertHeatmapClickFeedback,
} from '../../utils/packagingHeatmapFeedback';

// Memoize to prevent 60fps re-renders of pins
const PinMarker = React.memo<{
    click: PackagingHeatmapClick;
    index: number;
    intent: string;
    isNew: boolean;
}>(({ click, index, intent, isNew }) => {
    let bg = 'bg-emerald-500';
    let Icon = Heart;
    if (intent === 'dislikes') {
        bg = 'bg-rose-500';
        Icon = X;
    } else if (intent === 'improve') {
        bg = 'bg-amber-500';
        Icon = Wrench;
    }

    return (
        <div
            className={`absolute flex items-center justify-center w-8 h-8 -ml-4 -mt-4 rounded-full text-white shadow-xl pointer-events-none transition-transform ${bg} ${isNew ? 'animate-bounce' : ''}`}
            style={{
                left: `${click.x * 100}%`,
                top: `${click.y * 100}%`,
            }}
        >
            <Icon className="w-4 h-4" />
            <span className="absolute -top-2 -right-2 bg-slate-900 border-[1.5px] border-white text-[9px] font-black w-[18px] h-[18px] rounded-full flex items-center justify-center">
                {index + 1}
            </span>
            {isNew && (
                <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${bg}`} />
            )}
        </div>
    );
});

interface PackagingHeatmapQuestionProps {
    question: ProductTestRespondentQuestion;
    value: unknown;
    onChange: (next: PackagingHeatmapAnswer) => void;
    language: 'en' | 'ar';
    publicToken?: string;
    pulseError?: boolean;
    aiFollowup?: any;
    followUpStateMap?: FollowUpStateMap;
    onFollowUpTrigger?: FollowUpTriggerHandler;
    onVoiceFollowUpTrigger?: VoiceFollowUpTriggerHandler;
    onFollowUpReplyChange?: FollowUpReplyChangeHandler;
    onFollowUpDismiss?: (questionIds: string[]) => void;
    followUpEligibility?: FollowUpEligibilityInput;
    brandName?: string;
    showFollowUpVoice?: boolean;
    maxFollowUpRounds?: number;
}

function isPackagingHeatmapAnswer(value: unknown): value is PackagingHeatmapAnswer {
    if (!value || typeof value !== 'object') return false;
    const obj = value as PackagingHeatmapAnswer;
    return Array.isArray(obj.regions) || Array.isArray(obj.clicks);
}

function emptyAnswer(question: ProductTestRespondentQuestion): PackagingHeatmapAnswer {
    const meta = question.questionMeta;
    return {
        image_side: meta?.imageSide || 'front',
        intent: meta?.heatmapIntent || 'attraction',
        ref_width: meta?.imageWidth || 1,
        ref_height: meta?.imageHeight || 1,
        clicks: [],
        regions: [],
        overall_comment: '',
        overall_voice_note_id: undefined,
    };
}

export function pointerToNormalizedCoords(
    clientX: number,
    clientY: number,
    img: HTMLImageElement,
): { x: number; y: number } | null {
    const rect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    if (!naturalWidth || !naturalHeight) return null;

    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const displayW = naturalWidth * scale;
    const displayH = naturalHeight * scale;
    const offsetX = (rect.width - displayW) / 2;
    const offsetY = (rect.height - displayH) / 2;

    const localX = clientX - rect.left - offsetX;
    const localY = clientY - rect.top - offsetY;

    const x = Math.min(1, Math.max(0, localX / displayW));
    const y = Math.min(1, Math.max(0, localY / displayH));
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

export function pointerToClampedNormalizedCoords(
    clientX: number,
    clientY: number,
    img: HTMLImageElement,
): { x: number; y: number } | null {
    return pointerToNormalizedCoords(clientX, clientY, img);
}

export default function PackagingHeatmapQuestion({
    question,
    value,
    onChange,
    language,
    publicToken,
    pulseError = false,
    aiFollowup,
    followUpStateMap,
    onFollowUpTrigger,
    onVoiceFollowUpTrigger,
    onFollowUpReplyChange,
    onFollowUpDismiss,
    followUpEligibility,
    brandName = '',
    showFollowUpVoice = false,
    maxFollowUpRounds = 2,
}: PackagingHeatmapQuestionProps) {
    const isArabic = language === 'ar';
    const imgRef = useRef<HTMLImageElement>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [hasTapped, setHasTapped] = useState(false);

    const meta = question.questionMeta;
    const side = meta?.imageSide || 'front';
    const intent = meta?.heatmapIntent || 'attraction';
    const maxPins = meta?.maxClicks || 10;
    const refWidth = meta?.imageWidth || 1;
    const refHeight = meta?.imageHeight || 1;

    const answer = useMemo(
        () => (isPackagingHeatmapAnswer(value) ? { ...emptyAnswer(question), ...value } : emptyAnswer(question)),
        [value, question],
    );

    const imageUrl = publicToken ? packagingHeatmap.publicImageUrl(publicToken, side) : '';

    const commitAnswer = useCallback((updates: Partial<PackagingHeatmapAnswer>) => {
        onChange({
            image_side: side,
            intent,
            ref_width: refWidth,
            ref_height: refHeight,
            clicks: answer.clicks || [],
            regions: answer.regions || [],
            overall_comment: answer.overall_comment || '',
            overall_voice_note_id: answer.overall_voice_note_id || undefined,
            ...updates
        });
    }, [onChange, side, intent, refWidth, refHeight, answer]);

    const updateClick = useCallback((index: number, updater: (click: PackagingHeatmapClick) => PackagingHeatmapClick) => {
        const clicks = answer.clicks || [];
        if (!clicks[index]) return;
        const nextClicks = clicks.map((click, idx) => (idx === index ? updater(click) : click));
        commitAnswer({ clicks: nextClicks });
    }, [answer.clicks, commitAnswer]);

    const pinPromptText = useCallback((index: number) => {
        const point = index + 1;
        if (intent === 'dislikes') {
            return isArabic
                ? `ما الذي لم يعجبك في النقطة ${point} على التغليف؟`
                : `What did you dislike about packaging point ${point}?`;
        }
        if (intent === 'improve') {
            return isArabic
                ? `ما الذي تقترح تحسينه في النقطة ${point} على التغليف؟`
                : `What would you recommend improving about packaging point ${point}?`;
        }
        return isArabic
            ? `ما الذي أعجبك في النقطة ${point} على التغليف؟`
            : `What did you like about packaging point ${point}?`;
    }, [intent, isArabic]);

    const triggerPinFollowUp = useCallback(async (
        index: number,
        answerText: string,
        source: 'text' | 'voice',
        feedbackUpdates: Partial<PackagingHeatmapClick['feedback']> = {},
    ) => {
        const key = buildHeatmapPinFollowUpKey(question.id, index);
        updateClick(index, (click) =>
            upsertHeatmapClickFeedback(click, intent, {
                ...feedbackUpdates,
                follow_up_requested: true,
            }),
        );

        if (!aiFollowup?.is_enabled || !onFollowUpTrigger || !followUpEligibility) return;
        if (source === 'text' && !aiFollowup.apply_to_text) return;
        if (source === 'voice' && !aiFollowup.apply_to_voice) return;

        await onFollowUpTrigger(
            key,
            answerText,
            pinPromptText(index),
            brandName,
            source,
            followUpEligibility,
        );
    }, [
        aiFollowup,
        brandName,
        followUpEligibility,
        intent,
        onFollowUpTrigger,
        pinPromptText,
        question.id,
        updateClick,
    ]);

    const handleTap = (event: React.MouseEvent<HTMLDivElement>) => {
        const clicks = answer.clicks || [];
        if (clicks.length >= maxPins) {
            toast.error(
                isArabic
                    ? `الحد الأقصى ${maxPins} نقاط لكل سؤال`
                    : `Maximum ${maxPins} pins per question reached`,
            );
            return;
        }

        const img = imgRef.current;
        if (!img) return;
        const coords = pointerToNormalizedCoords(event.clientX, event.clientY, img);
        if (!coords) return;

        if (window.navigator && window.navigator.vibrate) {
            try {
                window.navigator.vibrate(15);
            } catch (e) {
                // Ignore
            }
        }

        setHasTapped(true);

        const nextClicks = [
            ...clicks,
            { x: coords.x, y: coords.y, ts: Date.now() },
        ];
        commitAnswer({ clicks: nextClicks });
    };

    const undoLast = () => {
        const clicks = answer.clicks || [];
        if (!clicks.length) return;
        onFollowUpDismiss?.([buildHeatmapPinFollowUpKey(question.id, clicks.length - 1)]);
        commitAnswer({ clicks: clicks.slice(0, -1) });
    };

    const cardClass = `rounded-[1.75rem] border overflow-hidden bg-slate-950/5 dark:bg-slate-900 ${pulseError
        ? 'border-rose-400 ring-4 ring-rose-500/30'
        : 'border-slate-200 dark:border-slate-800'
        }`;

    const clicks = answer.clicks || [];

    const overlayMsg = intent === 'attraction' ? (isArabic ? 'المس الأجزاء التي تعجبك' : 'Tap on the parts you like')
        : intent === 'dislikes' ? (isArabic ? 'المس الأجزاء التي لا تعجبك' : 'Tap on the parts you dislike')
            : (isArabic ? 'المس الأجزاء التي تقترح تحسينها' : 'Tap on the parts to improve');

    return (
        <div className={cardClass}>
            <div
                className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-950 touch-none select-none cursor-crosshair overflow-hidden"
                style={{ touchAction: 'none' }}
                onClick={handleTap}
            >
                {!imageLoaded && !imageError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 z-10">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {isArabic ? 'تحميل صورة التغليف' : 'Loading packaging image'}
                        </span>
                    </div>
                )}

                {imageError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-rose-500 p-6 text-center z-10">
                        <Crosshair className="w-8 h-8" />
                        <p className="text-xs font-bold">
                            {isArabic ? 'تعذر تحميل صورة التغليف' : 'Could not load packaging image'}
                        </p>
                    </div>
                )}

                {imageUrl && (
                    <img
                        ref={imgRef}
                        src={imageUrl}
                        alt={side === 'front' ? 'Front packaging' : 'Back packaging'}
                        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                        draggable={false}
                        onLoad={() => {
                            setImageLoaded(true);
                            setImageError(false);
                        }}
                        onError={() => {
                            setImageError(true);
                            setImageLoaded(false);
                        }}
                    />
                )}

                {/* Instruction overlay - fades out after tap */}
                <div className={`absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-opacity duration-500 z-20 pointer-events-none ${hasTapped ? 'opacity-0' : 'opacity-100'}`}>
                    <Crosshair className="w-4 h-4" />
                    <span>{overlayMsg}</span>
                </div>

                {/* Legacy regions */}
                {imageLoaded && (answer.regions || []).map((region, idx) => (
                    <div
                        key={`region-${region.ts || idx}`}
                        className="absolute border-2 border-slate-500 bg-slate-500/20 pointer-events-none"
                        style={{
                            left: `${region.x1 * 100}%`,
                            top: `${region.y1 * 100}%`,
                            width: `${(region.x2 - region.x1) * 100}%`,
                            height: `${(region.y2 - region.y1) * 100}%`,
                        }}
                    />
                ))}

                {/* New Pins */}
                {imageLoaded && clicks.map((click, index) => (
                    <PinMarker
                        key={`click-${click.ts || index}`}
                        click={click}
                        index={index}
                        intent={intent}
                        isNew={index === clicks.length - 1 && Date.now() - (click.ts || 0) < 1000}
                    />
                ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {isArabic ? 'النقاط' : 'Pins'}: {clicks.length}/{maxPins}
                </p>

                <button
                    type="button"
                    onClick={undoLast}
                    disabled={!clicks.length}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:border-brand-blue/40 transition-colors ml-auto"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {isArabic ? 'تراجع' : 'Undo'}
                </button>
            </div>

            {/* Required per-pin feedback */}
            <div className={`overflow-hidden transition-all duration-300 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 ${clicks.length > 0 ? 'max-h-[1400px] opacity-100' : 'max-h-0 opacity-0 border-t-0'}`}>
                <div className="p-4 space-y-4">
                    <div className="flex gap-3 text-slate-500 dark:text-slate-400">
                        <MessageSquare className="w-5 h-5 shrink-0 mt-0.5" />
                        <p className="text-xs font-bold leading-relaxed">
                            {isArabic
                                ? 'كل نقطة تحتاج تعليقاً مكتوباً أو ملاحظة صوتية. بعد الضغط على إضافة، سيبدأ الباحث الذكي متابعة خاصة بهذه النقطة.'
                                : 'Each pin needs a written answer or a voice note. Press Add to start a dedicated AI follow-up for that pin.'}
                        </p>
                    </div>

                    {clicks.map((click, index) => {
                        const key = buildHeatmapPinFollowUpKey(question.id, index);
                        const comment = getHeatmapPinComment(click);
                        const hasVoice = hasHeatmapPinVoice(click);
                        const hasAnswer = isHeatmapPinFeedbackAnswered(click);
                        const aiRequested = isHeatmapPinAiRequested(click);
                        const state = followUpStateMap?.[key];
                        const canSubmitText = comment.trim().length >= 5;

                        return (
                            <div
                                key={key}
                                className={`rounded-2xl border p-4 bg-white dark:bg-slate-900 space-y-3 ${hasAnswer && (!aiFollowup?.is_enabled || aiRequested)
                                    ? 'border-emerald-200 dark:border-emerald-900/60'
                                    : 'border-amber-200 dark:border-amber-900/60'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-brand-blue">
                                            {isArabic ? `النقطة ${index + 1}` : `Pin ${index + 1}`}
                                        </p>
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                            {pinPromptText(index)}
                                        </p>
                                    </div>
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${hasAnswer && (!aiFollowup?.is_enabled || aiRequested)
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : 'bg-amber-500/10 text-amber-600'
                                        }`}>
                                        {hasAnswer && (!aiFollowup?.is_enabled || aiRequested)
                                            ? (isArabic ? 'مكتملة' : 'Ready')
                                            : (isArabic ? 'مطلوبة' : 'Required')}
                                    </span>
                                </div>

                                <textarea
                                    value={comment}
                                    onChange={(e) => {
                                        const nextText = e.target.value;
                                        updateClick(index, (current) =>
                                            upsertHeatmapClickFeedback(current, intent, {
                                                comment: nextText,
                                                follow_up_requested: false,
                                            }),
                                        );
                                    }}
                                    placeholder={isArabic ? 'اكتب إجابتك لهذه النقطة...' : 'Write your answer for this pin...'}
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue min-h-[76px] resize-none"
                                    dir={isArabic ? 'rtl' : 'ltr'}
                                />

                                {publicToken && (
                                    <VoiceNoteRecorder
                                        language={language}
                                        onRecorded={async (blob) => {
                                            if (blob) {
                                                try {
                                                    const res = await publicApi.uploadHeatmapVoiceNote(publicToken, blob);
                                                    toast.success(isArabic ? 'تم حفظ التسجيل' : 'Voice note saved');
                                                    await triggerPinFollowUp(
                                                        index,
                                                        isArabic
                                                            ? `تم إرسال ملاحظة صوتية للنقطة ${index + 1}`
                                                            : `Voice note submitted for pin ${index + 1}`,
                                                        'voice',
                                                        { voice_note_asset_id: res.asset_id },
                                                    );
                                                } catch (err) {
                                                    console.error('Failed to upload voice note', err);
                                                    toast.error(isArabic ? 'حدث خطأ أثناء الرفع' : 'Upload failed');
                                                }
                                            } else {
                                                updateClick(index, (current) =>
                                                    upsertHeatmapClickFeedback(current, intent, {
                                                        voice_note_asset_id: undefined,
                                                        follow_up_requested: false,
                                                    }),
                                                );
                                            }
                                        }}
                                    />
                                )}

                                <button
                                    type="button"
                                    disabled={!canSubmitText && !hasVoice}
                                    onClick={() => {
                                        if (canSubmitText) {
                                            triggerPinFollowUp(index, comment, 'text');
                                        } else if (hasVoice) {
                                            triggerPinFollowUp(
                                                index,
                                                isArabic
                                                    ? `تم إرسال ملاحظة صوتية للنقطة ${index + 1}`
                                                    : `Voice note submitted for pin ${index + 1}`,
                                                'voice',
                                            );
                                        }
                                    }}
                                    className="w-full py-3 rounded-xl bg-brand-blue text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {aiFollowup?.is_enabled
                                        ? (isArabic ? 'إضافة وتشغيل المتابعة الذكية' : 'Add & Start AI Follow-Up')
                                        : (isArabic ? 'إضافة الإجابة' : 'Add Answer')}
                                </button>

                                <AiFollowUpPanel
                                    visible={!!state}
                                    state={state ?? { questionId: key, round: 1, followUpText: null, loading: false, quality: null }}
                                    language={language}
                                    maxRounds={maxFollowUpRounds}
                                    variant="standard"
                                    title={isArabic ? `متابعة النقطة ${index + 1}` : `Pin ${index + 1} Follow-Up`}
                                    showVoice={showFollowUpVoice}
                                    publicToken={publicToken}
                                    replyQuestionId={`followup-${key}-${state?.round ?? 1}`}
                                    brandName={brandName}
                                    followUpQuestionText={state?.followUpText ?? null}
                                    onReplyChange={(replyValue) => onFollowUpReplyChange?.(key, replyValue)}
                                    onReplyTextSubmit={(text) => {
                                        if (!aiFollowup?.apply_to_text || !onFollowUpTrigger || !followUpEligibility || text.trim().length < 5) return;
                                        updateClick(index, (current) =>
                                            upsertHeatmapClickFeedback(current, intent, {
                                                comment: appendFollowUpExchangeToText(
                                                    getHeatmapPinComment(current),
                                                    state?.followUpText,
                                                    text,
                                                ),
                                                follow_up_requested: true,
                                            }),
                                        );
                                        onFollowUpTrigger(key, text, pinPromptText(index), brandName, 'text', followUpEligibility);
                                        onFollowUpReplyChange?.(key, {});
                                    }}
                                    onReplyVoiceUpload={(feedbackId) => {
                                        if (!aiFollowup?.apply_to_voice || !onVoiceFollowUpTrigger || !followUpEligibility) return;
                                        onVoiceFollowUpTrigger(key, feedbackId, pinPromptText(index), brandName, followUpEligibility);
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
