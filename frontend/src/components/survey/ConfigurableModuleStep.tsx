import { useEffect, useMemo } from 'react';
import { ChevronRight, Loader2, Quote, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ConfigurableModuleId } from '../../types/surveyFlow';
import type { ModuleAnswersMap, ModuleBrandContext } from '../../types/moduleQuestions';
import type { QuestionModule } from '../../types/questionModules';
import ModuleQuestionRenderer from './ModuleQuestionRenderer';
import {
    asBrandPipelineCarrier,
    findMissingSpecifyOption,
    flattenModuleQuestions,
    getOptionDisplayLabel,
    isAnswerComplete,
} from '../../utils/moduleQuestionUtils';
import { sanitizePfAnswersForQuestion } from '../../utils/purchaseFunnelBrandLogic';
import {
    type VoiceCaptureConfig,
    isVoiceEnabledForModuleOpenQuestion,
} from '../../utils/voiceQuestions';

const MODULE_COPY: Record<
    ConfigurableModuleId,
    { journeyEn: string; journeyAr: string; hintEn: (category: string) => string; hintAr: (category: string) => string }
> = {
    purchase_funnel: {
        journeyEn: 'Purchase Journey',
        journeyAr: 'رحلة الشراء',
        hintEn: (c) => `Please answer based on your awareness and experience with ${c}.`,
        hintAr: (c) => `يرجى الإجابة بناءً على تجربتك مع ${c}.`,
    },
    brand_usage: {
        journeyEn: 'Usage Habits',
        journeyAr: 'عادات الاستخدام',
        hintEn: (c) => `Tell us how you typically use ${c}.`,
        hintAr: (c) => `أخبرنا كيف تستخدم ${c} عادةً.`,
    },
    brand_pricing_behavior: {
        journeyEn: 'Pricing & Purchase',
        journeyAr: 'التسعير والشراء',
        hintEn: (c) => `Share how you budget, stock, and buy ${c}.`,
        hintAr: (c) => `شاركنا كيف تخطط وتشتري ${c}.`,
    },
    brand_analyzer: {
        journeyEn: 'Brand Intelligence',
        journeyAr: 'ذكاء العلامة التجارية',
        hintEn: (c) => `Help us measure the strength and perception of brands in ${c}.`,
        hintAr: (c) => `ساعدنا في قياس قوة وتصور العلامات التجارية في ${c}.`,
    },
};

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
    const copy = MODULE_COPY[moduleId];
    const showVoice = isVoiceEnabledForModuleOpenQuestion(voiceCapture);

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

    const handleNext = async () => {
        if (loading || !currentQuestion) return;

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

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-brand-blue" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {sectionTitle} • {stepIndex + 1}/{totalSteps}
                    </span>
                </div>
                <div className="w-24 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-brand-blue transition-all duration-500"
                        style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
                    />
                </div>
            </div>

            <div className="relative p-8 bg-slate-50 dark:bg-slate-800/80 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="absolute top-[-20%] right-[-5%] opacity-10 pointer-events-none">
                    <Quote className="w-40 h-40 text-brand-blue" />
                </div>
                <div className="relative z-10 flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-blue/60">
                        <Sparkles className="w-3 h-3" />
                        {language === 'ar' ? copy.journeyAr : copy.journeyEn}
                    </div>
                    <p className="text-lg md:text-xl font-display font-light italic text-slate-600 dark:text-slate-300 leading-relaxed border-l-4 border-brand-blue/30 pl-6">
                        {language === 'ar' ? copy.hintAr(category) : copy.hintEn(category)}
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
                publicToken={publicToken}
                showVoice={showVoice && currentQuestion.type === 'open_single' && !isPurchaseFunnelTopOfMindQuestion}
                questionText={resolvedQuestionText}
                brandName={brandName}
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
    );
}
