import { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ConfigurableModuleId } from '../../types/surveyFlow';
import type { ModuleAnswersMap, ModuleBrandContext } from '../../types/moduleQuestions';
import type { ModuleQuestion, QuestionModule } from '../../types/questionModules';
import ModuleQuestionRenderer from './ModuleQuestionRenderer';
import {
    asBrandPipelineCarrier,
    findMissingSpecifyOption,
    flattenModuleQuestions,
    getOptionDisplayLabel,
    isAnswerComplete,
} from '../../utils/moduleQuestionUtils';
import { sanitizePfAnswersForQuestion, skipSoleBrandSteps, soleListedBrand } from '../../utils/purchaseFunnelBrandLogic';
import {
    type VoiceCaptureConfig,
    isVoiceEnabledForModuleOpenQuestion,
} from '../../utils/voiceQuestions';

function isBrandChoiceQuestion(question: ModuleQuestion): boolean {
    if (question.type !== 'mcq' && question.type !== 'scq') return false;
    const hasOptions = (question.options?.length ?? 0) > 0;
    return Boolean(question.brand_pipeline) || (Boolean(question.has_other) && !hasOptions);
}

/** A fixed option list with exactly one real answer. "Add another" is not a choice. */
function soleFixedOption(question: ModuleQuestion): string | null {
    if (question.type !== 'mcq' && question.type !== 'scq') return null;
    if (isBrandChoiceQuestion(question)) return null;
    const options = question.options ?? [];
    if (options.length !== 1) return null;
    const only = options[0];
    if (!only?.value || only.value.toLowerCase() === 'open-end') return null;
    if (only.allows_specify) return null;
    return only.value;
}

export interface ConfigurableModuleStepProps {
    moduleId: ConfigurableModuleId;
    module: QuestionModule;
    language: 'en' | 'ar';
    category: string;
    brandContext?: ModuleBrandContext;
    loading?: boolean;
    answers: ModuleAnswersMap;
    stepIndex: number;
    onAnswersChange: (answers: ModuleAnswersMap) => void;
    onStepIndexChange: (index: number) => void;
    onComplete: (answers: ModuleAnswersMap) => void;
    /** Called when Back is pressed on the first question — return to previous survey phase. */
    onBoundaryBack?: () => boolean;
    /** Show Back on the first question when a previous phase exists. */
    allowCrossPhaseBack?: boolean;
    completeLabel?: string;
    publicToken?: string;
    voiceCapture?: VoiceCaptureConfig | null;
}

export default function ConfigurableModuleStep({
    moduleId,
    module,
    language,
    category,
    brandContext,
    loading = false,
    answers,
    stepIndex,
    onAnswersChange,
    onStepIndexChange,
    onComplete,
    onBoundaryBack,
    allowCrossPhaseBack = false,
    completeLabel,
    publicToken,
    voiceCapture,
}: ConfigurableModuleStepProps) {
    const questions = useMemo(
        () => flattenModuleQuestions(module.sections),
        [module.sections]
    );
    const currentQuestion = questions[stepIndex] ?? null;
    const totalSteps = questions.length;
    const showVoice = isVoiceEnabledForModuleOpenQuestion(voiceCapture);
    const canGoBack = stepIndex > 0 || allowCrossPhaseBack;
    const navDirection = useRef<'forward' | 'back'>('forward');
    const appliedSkip = useRef('');

    const isPurchaseFunnelTopOfMindQuestion = useMemo(() => {
        if (!currentQuestion || moduleId !== 'purchase_funnel') return false;
        const qid = (currentQuestion.question_id || '').toLowerCase();
        // Keep the first Top-of-Mind question text-only in purchase funnel.
        return qid === 'pf_q1' || qid === 'aw_q1';
    }, [currentQuestion, moduleId]);

    const resolvedQuestionText = useMemo(() => {
        if (!currentQuestion) return '';
        const raw = currentQuestion[language === 'ar' ? 'ar_text' : 'en_text'] || '';
        return raw.replace('{{category}}', category).replace('{{product}}', category);
    }, [currentQuestion, language, category]);

    const brandName = brandContext?.masterBrands[0] || '';

    const masterBrands = useMemo(
        () => [
            ...(brandContext?.masterBrands || []),
            ...(brandContext?.customBrands || []),
        ],
        [brandContext?.masterBrands, brandContext?.customBrands]
    );

    const upstreamKey = useMemo(() => {
        if (!currentQuestion?.brand_pipeline) return '';
        return JSON.stringify(
            currentQuestion.brand_pipeline.sources.map((sid) => answers[sid])
        );
    }, [currentQuestion, answers]);

    useEffect(() => {
        if (moduleId !== 'purchase_funnel' || !currentQuestion) return;
        if (currentQuestion.type === 'open_single' || currentQuestion.type === 'open_loop') return;

        const sanitized = sanitizePfAnswersForQuestion(
            asBrandPipelineCarrier(currentQuestion),
            masterBrands,
            answers as Record<string, unknown>,
            brandContext?.customBrands || []
        );
        if (JSON.stringify(sanitized) !== JSON.stringify(answers)) {
            onAnswersChange(sanitized as ModuleAnswersMap);
        }
    }, [moduleId, stepIndex, upstreamKey, currentQuestion, masterBrands, answers, onAnswersChange]);

    // One listed choice is not a decision, whatever that choice is. Record it
    // and move past the screen. "Add another brand" does not count as a second
    // choice. A run of single-choice screens is skipped together.
    useEffect(() => {
        if (!currentQuestion) return;

        const direction = navDirection.current;
        const result = skipSoleBrandSteps(
            questions.map((question) => ({
                id: question.question_id,
                type: question.type,
                brandChoice: isBrandChoiceQuestion(question),
                carrier: asBrandPipelineCarrier(question),
                soleChoice: isBrandChoiceQuestion(question) ? undefined : soleFixedOption(question),
            })),
            stepIndex,
            answers as Record<string, unknown>,
            masterBrands,
            direction,
            brandContext?.customBrands || [],
        );

        if (result.action === 'stay') return;

        const signature = `${direction}:${stepIndex}:${result.action}:${result.index}`;
        if (appliedSkip.current === signature) return;
        appliedSkip.current = signature;

        const nextAnswers = result.answers as ModuleAnswersMap;
        if (result.action === 'complete') {
            onComplete(nextAnswers);
            return;
        }
        if (JSON.stringify(nextAnswers) !== JSON.stringify(answers)) {
            onAnswersChange(nextAnswers);
        }
        if (result.action === 'boundary') {
            onBoundaryBack?.();
            return;
        }
        onStepIndexChange(result.index);
    }, [stepIndex, upstreamKey, currentQuestion, questions, masterBrands, answers, onAnswersChange, onStepIndexChange, onComplete, onBoundaryBack]);

    const handleBack = () => {
        if (loading || !canGoBack) return;
        navDirection.current = 'back';
        appliedSkip.current = '';

        if (stepIndex > 0) {
            onStepIndexChange(stepIndex - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        onBoundaryBack?.();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleNext = async () => {
        if (loading || !currentQuestion) return;
        navDirection.current = 'forward';
        appliedSkip.current = '';

        const missingSpecifyOption = findMissingSpecifyOption(
            currentQuestion,
            answers[currentQuestion.question_id],
        );
        if (missingSpecifyOption) {
            const label = getOptionDisplayLabel(missingSpecifyOption, language);
            toast.error(
                language === 'ar'
                    ? `يرجى توضيح إجابة "${label}" للمتابعة`
                    : `Please specify your "${label}" answer to continue`
            );
            return;
        }

        if (!isAnswerComplete(currentQuestion, answers[currentQuestion.question_id])) {
            toast.error(
                language === 'ar'
                    ? 'يرجى اختيار إجابة للمتابعة'
                    : 'Please select an answer to continue'
            );
            return;
        }

        if (stepIndex < totalSteps - 1) {
            onStepIndexChange(stepIndex + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        onComplete(answers);
    };

    if (!currentQuestion) {
        return (
            <p className="text-center text-slate-400 text-sm font-bold uppercase tracking-widest py-12">
                {language === 'ar' ? 'لا توجد أسئلة في هذه الوحدة' : 'No questions in this module'}
            </p>
        );
    }

    const sectionTitle =
        module.sections.find((s) =>
            s.questions?.some((q) => q.question_id === currentQuestion.question_id)
        )?.[language === 'ar' ? 'title_ar' : 'title_en'] || module.name;

    const isLast = stepIndex === totalSteps - 1;
    const hiddenSoleChoice = Boolean(
        currentQuestion && (
            soleFixedOption(currentQuestion)
            || (
                isBrandChoiceQuestion(currentQuestion)
                && soleListedBrand(
                    asBrandPipelineCarrier(currentQuestion),
                    masterBrands,
                    answers as Record<string, unknown>,
                    brandContext?.customBrands || [],
                )
            )
        )
    );

    if (hiddenSoleChoice) return null;

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-primary-soft" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {sectionTitle} • {stepIndex + 1}/{totalSteps}
                    </span>
                </div>
                <div className="w-24 h-1 bg-surface-sunken rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
                    />
                </div>
            </div>

            <ModuleQuestionRenderer
                question={currentQuestion}
                answer={answers[currentQuestion.question_id]}
                onChange={(value) =>
                    onAnswersChange({ ...answers, [currentQuestion.question_id]: value })
                }
                language={language}
                placeholders={{ product: category, category }}
                brandContext={brandContext}
                allAnswers={answers}
                publicToken={publicToken}
                showVoice={showVoice && currentQuestion.type === 'open_single' && !isPurchaseFunnelTopOfMindQuestion}
                questionText={resolvedQuestionText}
                brandName={brandName}
            />

            <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center gap-4 mt-8">
                <button
                    type="button"
                    onClick={handleBack}
                    disabled={loading || !canGoBack}
                    className={`btn-secondary px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-0 ${canGoBack ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    aria-label={language === 'ar' ? 'السابق' : 'Previous'}
                >
                    <ChevronLeft className="w-5 h-5" />
                    {language === 'ar' ? 'السابق' : 'Previous'}
                </button>

                <button
                    type="button"
                    onClick={handleNext}
                    disabled={loading}
                    className="btn-premium flex-1 py-5 text-white flex items-center justify-center gap-3 group shadow-xl shadow-brand-accent/20 font-black tracking-widest uppercase text-xs rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            {isLast
                                ? completeLabel || (language === 'ar' ? 'متابعة' : 'Continue')
                                : language === 'ar'
                                    ? 'التالي'
                                    : 'Next'}
                            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
