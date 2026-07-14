import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
    ModuleAnswerValue,
    ModuleAnswersMap,
    UseModuleSurveyOptions,
    UseModuleSurveyResult,
} from '../types/moduleQuestions';
import type { ModuleQuestion } from '../types/questionModules';
import {
    flattenModuleQuestions,
    isAnswerComplete,
    loadModuleSurveyState,
    saveModuleSurveyState,
} from '../utils/moduleQuestionUtils';
export function useModuleSurvey({
    moduleId: _moduleId,
    sections,
    persistenceKey,
    initialAnswers = {},
    initialStepIndex = 0,
}: UseModuleSurveyOptions): UseModuleSurveyResult {
    const questions = useMemo(() => flattenModuleQuestions(sections), [sections]);

    const [stepIndex, setStepIndex] = useState(initialStepIndex);
    const [answers, setAnswers] = useState<ModuleAnswersMap>(() => {
        if (persistenceKey) {
            const saved = loadModuleSurveyState(persistenceKey);
            if (saved) return saved.answers;
        }
        return { ...initialAnswers };
    });

    useEffect(() => {
        if (!persistenceKey) return;
        const saved = loadModuleSurveyState(persistenceKey);
        if (saved) {
            setAnswers(saved.answers);
            setStepIndex(saved.stepIndex);
        }
    }, [persistenceKey]);

    useEffect(() => {
        if (!persistenceKey) return;
        saveModuleSurveyState(persistenceKey, {
            answers: answers as Record<string, ModuleAnswerValue>,
            stepIndex,
        });
    }, [answers, stepIndex, persistenceKey]);

    const currentQuestion: ModuleQuestion | null = questions[stepIndex] ?? null;
    const totalSteps = questions.length;
    const isFirstStep = stepIndex <= 0;
    const isLastStep = stepIndex >= totalSteps - 1;

    const setAnswer = useCallback((questionId: string, value: ModuleAnswerValue) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    }, []);

    const validateCurrent = useCallback((): boolean => {
        if (!currentQuestion) return true;
        return isAnswerComplete(currentQuestion, answers[currentQuestion.question_id]);
    }, [currentQuestion, answers]);

    const goNext = useCallback((): boolean => {
        if (!validateCurrent()) return false;
        if (stepIndex < totalSteps - 1) {
            setStepIndex((i) => i + 1);
            return true;
        }
        return true;
    }, [stepIndex, totalSteps, validateCurrent]);

    const goBack = useCallback(() => {
        setStepIndex((i) => Math.max(0, i - 1));
    }, []);

    const reset = useCallback(() => {
        setAnswers({ ...initialAnswers });
        setStepIndex(initialStepIndex);
        if (persistenceKey) {
            localStorage.removeItem(persistenceKey);
        }
    }, [initialAnswers, initialStepIndex, persistenceKey]);

    return {
        questions,
        currentQuestion,
        stepIndex,
        totalSteps,
        answers,
        setAnswer,
        goNext,
        goBack,
        validateCurrent,
        isFirstStep,
        isLastStep,
        reset,
    };
}
