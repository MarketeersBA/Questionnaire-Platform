import { useEffect, useMemo } from 'react';
import { ChevronRight, Loader2, Quote, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ModuleAnswersMap, ModuleBrandContext } from '../../types/moduleQuestions';
import type { QuestionModule } from '../../types/questionModules';
import ModuleQuestionRenderer from './ModuleQuestionRenderer';
import {
    asBrandPipelineCarrier,
    flattenModuleQuestions,
    isAnswerComplete,
} from '../../utils/moduleQuestionUtils';
import {
    sanitizePfAnswersForQuestion,
} from '../../utils/purchaseFunnelBrandLogic';

export interface PurchaseFunnelStepProps {
    module: QuestionModule;
    language: 'en' | 'ar';
    category: string;
    brandContext: ModuleBrandContext;
    loading?: boolean;
    answers: ModuleAnswersMap;
    stepIndex: number;
    onAnswersChange: (answers: ModuleAnswersMap) => void;
    onStepIndexChange: (index: number) => void;
    onComplete: (answers: ModuleAnswersMap) => void;
}

export default function PurchaseFunnelStep({
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
}: PurchaseFunnelStepProps) {
    const questions = useMemo(
        () => flattenModuleQuestions(module.sections),
        [module.sections]
    );
    const currentQuestion = questions[stepIndex] ?? null;
    const totalSteps = questions.length;

    const masterBrands = useMemo(
        () => [
            ...(brandContext.masterBrands || []),
            ...(brandContext.customBrands || []),
        ],
        [brandContext.masterBrands, brandContext.customBrands]
    );

    const upstreamKey = useMemo(() => {
        if (!currentQuestion?.brand_pipeline) return '';
        return JSON.stringify(
            currentQuestion.brand_pipeline.sources.map((sid) => answers[sid])
        );
    }, [currentQuestion, answers]);

    useEffect(() => {
        if (!currentQuestion) return;
        if (currentQuestion.type === 'open_single' || currentQuestion.type === 'open_loop') return;

        const sanitized = sanitizePfAnswersForQuestion(
            asBrandPipelineCarrier(currentQuestion),
            masterBrands,
            answers as Record<string, unknown>
        );
        if (JSON.stringify(sanitized) !== JSON.stringify(answers)) {
            onAnswersChange(sanitized as ModuleAnswersMap);
        }
    }, [stepIndex, upstreamKey, currentQuestion, masterBrands, onAnswersChange]);

    const handleNext = async () => {
        if (loading || !currentQuestion) return;

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
                {language === 'ar' ? 'لا توجد أسئلة في مسار الشراء' : 'No purchase funnel questions'}
            </p>
        );
    }

    const sectionTitle =
        module.sections.find((s) =>
            s.questions?.some((q) => q.question_id === currentQuestion.question_id)
        )?.[language === 'ar' ? 'title_ar' : 'title_en'] || 'Purchase Funnel';

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

            <div className="relative p-8 bg-surface-raised/80 rounded-[2.5rem] border border-line/80 dark:border-line/10 overflow-hidden shadow-sm">
                <div className="absolute top-[-20%] right-[-5%] opacity-10 pointer-events-none">
                    <Quote className="w-40 h-40 text-primary-soft" />
                </div>
                <div className="relative z-10 flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary-soft/60">
                        <Sparkles className="w-3 h-3" />
                        {language === 'ar' ? 'رحلة الشراء' : 'Purchase Journey'}
                    </div>
                    <p className="text-lg md:text-xl font-display font-light italic text-ink-muted leading-relaxed border-l-4 border-primary/30 pl-6">
                        {language === 'ar'
                            ? `يرجى الإجابة بناءً على تجربتك مع ${category}.`
                            : `Please answer based on your awareness and experience with ${category}.`}
                    </p>
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
            />

            <button
                type="button"
                onClick={handleNext}
                disabled={loading}
                className="btn-premium w-full py-5 text-white flex items-center justify-center gap-3 group shadow-xl shadow-brand-accent/20 font-black tracking-widest uppercase text-xs rounded-2xl mt-8 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <>
                        {stepIndex === totalSteps - 1
                            ? language === 'ar'
                                ? 'إرسال الإجابات'
                                : 'Complete Survey'
                            : language === 'ar'
                              ? 'التالي'
                              : 'Next'}
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                )}
            </button>
        </div>
    );
}
