import { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import type { ModuleQuestionRendererProps, ModuleAnswerValue } from '../../types/moduleQuestions';
import type { QuestionOption } from '../../types/questionModules';
import OpenEndAnswerInput from '../voice-feedback/OpenEndAnswerInput';
import {
    normalizeOpenEndAnswer,
    updateOpenEndText,
} from '../../utils/voiceQuestions';
import { moduleOpenAnswerToText } from '../../utils/aiFollowup';
import {
    asBrandPipelineCarrier,
    getOptionDisplayLabel,
    getQuestionDisplayText,
    getSpecifyOtherText,
    isMcqItemSelected,
    isScqOptionSelected,
    isSpecifyAnswer,
    selectScqOption,
    toggleMcqOption,
    updateSpecifyOtherText,
} from '../../utils/moduleQuestionUtils';
import {
    resolvePurchaseFunnelBrands,
} from '../../utils/purchaseFunnelBrandLogic';
import {
    applyCustomBrandToAnswer,
    isBrandSelectedInAnswer,
} from '../../utils/respondentBrandAnswers';
import BrandAnalyzerGrid from './BrandAnalyzerGrid';
import BrandSatisfactionLoop from './BrandSatisfactionLoop';

// ── Option-based (SCQ / MCQ) ─────────────────────────────────────────────────

function SpecifyCommitField({
    optionValue,
    answer,
    isMcq,
    onChange,
    language,
}: {
    optionValue: string;
    answer: ModuleAnswerValue | undefined;
    isMcq: boolean;
    onChange: (value: ModuleAnswerValue) => void;
    language: 'en' | 'ar';
}) {
    const committed = getSpecifyOtherTextForOption(answer, optionValue, isMcq);
    const [draft, setDraft] = useState(committed);

    useEffect(() => {
        setDraft(committed);
    }, [committed, optionValue]);

    const commit = () => {
        const trimmed = draft.trim();
        if (!trimmed) return;
        onChange(updateSpecifyOtherText(answer, optionValue, trimmed, isMcq));
    };

    return (
        <div className="space-y-2 p-3 bg-surface rounded-xl border border-slate-200 dark:border-slate-700">
            <input
                type="text"
                required
                aria-label={language === 'ar' ? 'تحديد الإجابة' : 'Specify answer'}
                autoFocus
                className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold"
                placeholder={
                    language === 'ar'
                        ? 'يرجى التحديد...'
                        : 'Please specify...'
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commit();
                    }
                }}
            />
            <div className="flex items-center justify-between gap-2">
                {committed ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                        {language === 'ar' ? `تمت الإضافة: ${committed}` : `Added: ${committed}`}
                    </span>
                ) : (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {language === 'ar' ? 'اضغط إضافة لحفظ التوضيح' : 'Press Add to save your detail'}
                    </span>
                )}
                <button
                    type="button"
                    onClick={commit}
                    disabled={!draft.trim()}
                    className="text-[10px] font-black uppercase text-primary-soft px-3 py-1 disabled:opacity-40"
                >
                    {language === 'ar' ? 'إضافة' : 'Add'}
                </button>
            </div>
        </div>
    );
}

function OptionChoiceList({
    question,
    answer,
    onChange,
    language,
}: ModuleQuestionRendererProps) {
    const options = [...(question.options || [])].sort((a, b) => a.order - b.order);
    const isMcq = question.type === 'mcq';

    const handleSelect = (option: QuestionOption) => {
        if (isMcq) {
            onChange(toggleMcqOption(answer, option));
            return;
        }
        onChange(selectScqOption(option, getSpecifyOtherText(answer)));
    };

    return (
        <div className="grid grid-cols-1 gap-3">
            {options.map((option) => {
                const selected = isMcq
                    ? isMcqItemSelected(answer, option.value)
                    : isScqOptionSelected(answer, option.value);
                const label = getOptionDisplayLabel(option, language);
                const showSpecify =
                    selected && option.allows_specify;

                return (
                    <div key={option.value} className="space-y-2">
                        <button
                            type="button"
                            onClick={() => handleSelect(option)}
                            className={`w-full p-5 rounded-2xl border-2 text-left font-bold transition-all ${selected
                                ? 'bg-primary border-primary text-white shadow-lg'
                                : 'bg-surface-raised/50 border-line/80 dark:border-line/10 text-ink-muted'
                                }`}
                        >
                            {label}
                        </button>
                        {showSpecify && (
                            <SpecifyCommitField
                                optionValue={option.value}
                                answer={answer}
                                isMcq={isMcq}
                                onChange={onChange}
                                language={language}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function getSpecifyOtherTextForOption(
    answer: ModuleAnswerValue | undefined,
    optionValue: string,
    isMcq: boolean
): string {
    if (!isMcq) {
        if (isSpecifyAnswer(answer) && answer.value === optionValue) {
            return answer.otherText;
        }
        return '';
    }
    if (!Array.isArray(answer)) return '';
    const item = answer.find((entry) =>
        isSpecifyAnswer(entry) && entry.value === optionValue
    );
    return isSpecifyAnswer(item) ? item.otherText : '';
}

// ── Brand pipeline (PF module) ───────────────────────────────────────────────

function BrandChoiceList({
    question,
    answer,
    onChange,
    language,
    brandContext,
    allAnswers = {},
}: ModuleQuestionRendererProps) {
    const [showOtherInput, setShowOtherInput] = useState(false);
    const [otherBrandInput, setOtherBrandInput] = useState('');

    const masterBrands = useMemo(() => {
        const base = brandContext?.masterBrands || [];
        const custom = brandContext?.customBrands || [];
        return Array.from(
            new Map(
                [...base, ...custom].map((b) => [b.toLowerCase().trim(), b])
            ).values()
        );
    }, [brandContext?.masterBrands, brandContext?.customBrands]);

    const carrier = asBrandPipelineCarrier(question);
    const relevantBrands = resolvePurchaseFunnelBrands(
        carrier,
        masterBrands,
        allAnswers as Record<string, unknown>,
        question.has_other
            ? { currentAnswer: answer, customBrands: brandContext?.customBrands }
            : undefined
    );

    const isMcq = question.type === 'mcq';

    const toggleBrand = (brand: string) => {
        if (isMcq) {
            const list = Array.isArray(answer) ? [...answer] : [];
            const idx = list.findIndex(
                (item) => typeof item === 'string' && item.toLowerCase().trim() === brand.toLowerCase().trim()
            );
            if (idx >= 0) list.splice(idx, 1);
            else list.push(brand);
            onChange(list);
        } else {
            onChange(brand);
        }
    };

    const addCustomBrand = () => {
        const name = otherBrandInput.trim();
        if (!name) return;

        const nextAnswer = applyCustomBrandToAnswer(answer, name, isMcq);

        if (brandContext?.onCommitCustomBrand) {
            brandContext.onCommitCustomBrand(name, nextAnswer, question.question_id);
        } else {
            brandContext?.onAddCustomBrand?.(name);
            onChange(nextAnswer);
        }

        setOtherBrandInput('');
        setShowOtherInput(false);
    };

    return (
        <div className="grid grid-cols-1 gap-3">
            {relevantBrands.map((brand) => {
                const isSelected = isBrandSelectedInAnswer(answer, brand, isMcq);

                return (
                    <button
                        key={brand}
                        type="button"
                        onClick={() => toggleBrand(brand)}
                        className={`w-full p-5 rounded-2xl border-2 text-left font-bold transition-all ${isSelected
                            ? 'bg-primary border-primary text-white shadow-lg'
                            : 'bg-surface-raised/50 border-line/80 dark:border-line/10 text-ink-muted'
                            }`}
                    >
                        {brand}
                    </button>
                );
            })}

            {question.has_other && !showOtherInput && (
                <button
                    type="button"
                    onClick={() => setShowOtherInput(true)}
                    className="w-full p-5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 font-bold hover:border-primary hover:text-primary-soft transition-all flex items-center justify-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    {language === 'ar' ? 'أضف ماركة أخرى' : 'Add another brand'}
                </button>
            )}

            {question.has_other && showOtherInput && (
                <div className="space-y-2 p-2 bg-surface-raised/50 rounded-2xl border border-line/80 dark:border-line/10">
                    <input
                        type="text"
                        autoFocus
                        className="w-full bg-surface border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold"
                        placeholder={language === 'ar' ? 'اسم الماركة...' : 'Brand name...'}
                        value={otherBrandInput}
                        onChange={(e) => setOtherBrandInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addCustomBrand();
                            }
                        }}
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setShowOtherInput(false);
                                setOtherBrandInput('');
                            }}
                            className="text-[10px] font-black uppercase text-slate-400 px-3 py-1"
                        >
                            {language === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={addCustomBrand}
                            className="text-[10px] font-black uppercase text-primary-soft px-3 py-1"
                        >
                            {language === 'ar' ? 'إضافة' : 'Add'}
                        </button>
                    </div>
                </div>
            )}

            {relevantBrands.length === 0 && !question.has_other && (
                <p className="text-center py-10 text-slate-400 uppercase text-[10px] font-black tracking-widest">
                    {language === 'ar' ? 'لا توجد خيارات متاحة' : 'No options available'}
                </p>
            )}
        </div>
    );
}

// ── Open-ended ───────────────────────────────────────────────────────────────

function OpenSingleInput(props: ModuleQuestionRendererProps) {
    const { answer, onChange, language, disabled, showVoice, publicToken, question, questionText, brandName, onVoiceUploaded } = props;

    if (showVoice && publicToken) {
        return (
            <OpenEndAnswerInput
                value={answer}
                showVoice
                publicToken={publicToken}
                questionId={question.question_id}
                brandName={brandName}
                questionText={questionText}
                language={language}
                onChange={(next) => {
                    const prev = normalizeOpenEndAnswer(answer);
                    onChange(next as ModuleAnswerValue);
                    if (!prev.voice_feedback_id && next.voice_feedback_id) {
                        onVoiceUploaded?.(next.voice_feedback_id);
                    }
                }}
                onBlur={(text) => props.onBlur?.(text)}
            />
        );
    }

    return (
        <input
            type="text"
            disabled={disabled}
            className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 text-lg font-bold"
            placeholder={
                language === 'ar' ? 'اكتب اسم الماركة هنا...' : 'Type brand name here...'
            }
            value={moduleOpenAnswerToText(answer)}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => props.onBlur?.(moduleOpenAnswerToText(answer))}
        />
    );
}

function OpenLoopInput(props: ModuleQuestionRendererProps) {
    const { question, answer, onChange, language, disabled } = props;
    const rows: string[] = Array.isArray(answer) && answer.every((v) => typeof v === 'string')
        ? (answer as string[])
        : [''];

    return (
        <div className="space-y-3">
            {rows.map((val, i) => (
                <input
                    key={i}
                    type="text"
                    disabled={disabled}
                    className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 font-bold"
                    placeholder={language === 'ar' ? `ماركة ${i + 1}...` : `Brand ${i + 1}...`}
                    value={val}
                    onChange={(e) => {
                        const next = [...rows];
                        next[i] = e.target.value;
                        onChange(next);
                    }}
                    onBlur={() => props.onBlur?.(rows)}
                />
            ))}
            <button
                type="button"
                disabled={disabled}
                onClick={() => onChange([...rows, ''])}
                className="text-[10px] font-black uppercase tracking-widest text-primary-soft flex items-center gap-2"
            >
                <Plus className="w-4 h-4" />
                {language === 'ar' ? 'إضافة ماركة أخرى' : 'Add another brand'}
            </button>
            {question.has_stop && (
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {language === 'ar'
                        ? 'يمكن للمستجيب التوقف عند عدم معرفة المزيد'
                        : 'Respondent may stop when no more brands are known'}
                </p>
            )}
        </div>
    );
}

// ── Main renderer ────────────────────────────────────────────────────────────

export default function ModuleQuestionRenderer(props: ModuleQuestionRendererProps) {
    const { question, language, placeholders } = props;

    const questionText = getQuestionDisplayText(question, language, placeholders);

    const usesOptions =
        (question.type === 'scq' || question.type === 'mcq') &&
        (question.options?.length ?? 0) > 0;

    const usesBrandList =
        Boolean(question.brand_pipeline) ||
        (
            question.has_other &&
            (question.type === 'mcq' || question.type === 'scq') &&
            !usesOptions
        );

    return (
        <div className="space-y-4">
            <h2 className="text-xl md:text-2xl font-display font-bold leading-tight text-ink">
                {questionText}
            </h2>

            {question.type === 'mcq' && usesOptions && (
                <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 border border-primary/10 rounded-lg w-fit">
                    <Sparkles className="w-3 h-3 text-primary-soft" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary-soft">
                        {language === 'ar' ? 'يمكنك اختيار أكثر من إجابة' : 'Select all that apply'}
                    </span>
                </div>
            )}

            {question.type === 'open_single' && (
                <OpenSingleInput {...props} />
            )}

            {question.type === 'open_loop' && (
                <OpenLoopInput {...props} />
            )}

            {usesBrandList && (question.type === 'mcq' || question.type === 'scq') && (
                <BrandChoiceList {...props} />
            )}

            {usesOptions && (
                <OptionChoiceList {...props} />
            )}

            {question.type === 'grid' && (
                <BrandAnalyzerGrid {...props} />
            )}

            {question.type === 'loop' && (
                <BrandSatisfactionLoop {...props} />
            )}
        </div>
    );
}
