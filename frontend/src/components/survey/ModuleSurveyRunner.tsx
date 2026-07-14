/**
 * Self-contained module survey UI — composes useModuleSurvey + ModuleQuestionRenderer.
 * Use with a mock or API module payload for isolated testing / Storybook-style demos.
 */

import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useModuleSurvey } from '../../hooks/useModuleSurvey';
import type { ModuleBrandContext, ModulePlaceholderContext } from '../../types/moduleQuestions';
import type { ModuleSection } from '../../types/questionModules';
import ModuleQuestionRenderer from './ModuleQuestionRenderer';

export interface ModuleSurveyRunnerProps {
    moduleId: string;
    moduleName: string;
    sections: ModuleSection[];
    language?: 'en' | 'ar';
    placeholders?: ModulePlaceholderContext;
    brandContext?: ModuleBrandContext;
    persistenceKey?: string;
    onComplete?: (answers: Record<string, unknown>) => void;
}

export default function ModuleSurveyRunner({
    moduleId,
    moduleName,
    sections,
    language = 'en',
    placeholders,
    brandContext,
    persistenceKey,
    onComplete,
}: ModuleSurveyRunnerProps) {
    const survey = useModuleSurvey({
        moduleId,
        sections,
        persistenceKey,
    });

    const { currentQuestion, stepIndex, totalSteps, answers, setAnswer, goNext, goBack, validateCurrent, isFirstStep, isLastStep } = survey;

    const handleNext = () => {
        if (!validateCurrent()) return;
        if (isLastStep) {
            onComplete?.(answers as Record<string, unknown>);
            return;
        }
        goNext();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!currentQuestion) {
        return (
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest text-center py-12">
                {language === 'ar' ? 'لا توجد أسئلة' : 'No questions in module'}
            </p>
        );
    }

    return (
        <div className="space-y-8 max-w-3xl mx-auto p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-brand-blue" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {moduleName} • {stepIndex + 1}/{totalSteps}
                    </span>
                </div>
                <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-brand-blue transition-all duration-500"
                        style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
                    />
                </div>
            </div>

            <ModuleQuestionRenderer
                question={currentQuestion}
                answer={answers[currentQuestion.question_id]}
                onChange={(value) => setAnswer(currentQuestion.question_id, value)}
                language={language}
                placeholders={placeholders}
                brandContext={brandContext}
                allAnswers={answers}
            />

            <div className="flex gap-3">
                {!isFirstStep && (
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex-1 py-4 rounded-2xl border-2 border-slate-200 font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {language === 'ar' ? 'السابق' : 'Back'}
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleNext}
                    className="btn-premium flex-[2] py-4 text-white font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 rounded-2xl"
                >
                    {isLastStep
                        ? (language === 'ar' ? 'إنهاء' : 'Complete')
                        : (language === 'ar' ? 'التالي' : 'Next')}
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
