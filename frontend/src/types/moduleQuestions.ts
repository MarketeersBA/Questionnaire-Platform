/**
 * Runtime types for DB-driven survey modules.
 * API/schema types live in questionModules.ts; this file adds answer contracts.
 */

export type {
    ModuleBrandPipeline,
    ModuleQuestion,
    ModuleQuestionType,
    ModuleSection,
    ModuleSnapshot,
    ModuleSnapshots,
    QuestionModule,
    QuestionModuleId,
    QuestionModuleSummary,
    QuestionModuleUpdatePayload,
    QuestionOption,
} from './questionModules';

/** Specify-option answer stored as { value, otherText }. */
export interface SpecifyAnswer {
    value: string;
    otherText: string;
}

export type McqAnswerItem = string | SpecifyAnswer;

import type { OpenEndAnswer } from '../utils/voiceQuestions';

/** All valid shapes for a single module question answer. */
export type ModuleAnswerValue =
    | string
    | string[]
    | OpenEndAnswer
    | number
    | Record<string, any>
    | SpecifyAnswer
    | McqAnswerItem[];

export type ModuleAnswersMap = Record<string, ModuleAnswerValue | undefined>;

export interface ModulePlaceholderContext {
    product?: string;
    category?: string;
    brand?: string;
}

export interface ModuleBrandContext {
    masterBrands: string[];
    customBrands?: string[];
    onAddCustomBrand?: (brand: string) => void;
    /**
     * Atomic custom-brand commit: registers the brand in the survey catalog
     * and persists the updated answer for the active question.
     */
    onCommitCustomBrand?: (
        brand: string,
        nextAnswer: ModuleAnswerValue,
        questionId: string
    ) => void;
}

export interface ModuleQuestionRendererProps {
    question: import('./questionModules').ModuleQuestion;
    answer: ModuleAnswerValue | undefined;
    onChange: (value: ModuleAnswerValue) => void;
    language: 'en' | 'ar';
    placeholders?: ModulePlaceholderContext;
    /** Required when question has brand_pipeline / has_other */
    brandContext?: ModuleBrandContext;
    /** Full answer map for brand-pipeline resolution */
    allAnswers?: ModuleAnswersMap;
    disabled?: boolean;
    onBlur?: (value: ModuleAnswerValue) => void;
    /** Voice capture — open_single with OpenEndAnswerInput */
    publicToken?: string;
    showVoice?: boolean;
    questionText?: string;
    brandName?: string;
    onVoiceUploaded?: (feedbackId: string) => void;
}

export interface UseModuleSurveyOptions {
    moduleId: string;
    sections: import('./questionModules').ModuleSection[];
    persistenceKey?: string;
    initialAnswers?: ModuleAnswersMap;
    initialStepIndex?: number;
}

export interface UseModuleSurveyResult {
    questions: import('./questionModules').ModuleQuestion[];
    currentQuestion: import('./questionModules').ModuleQuestion | null;
    stepIndex: number;
    totalSteps: number;
    answers: ModuleAnswersMap;
    setAnswer: (questionId: string, value: ModuleAnswerValue) => void;
    goNext: () => boolean;
    goBack: () => void;
    validateCurrent: () => boolean;
    isFirstStep: boolean;
    isLastStep: boolean;
    reset: () => void;
}
