import type { QuestionModuleId } from './questionModules';

/** High-level respondent journey phases. */
export type SurveyStep =
    | 'loading'
    | 'welcome'
    | 'layer1'
    | 'passed'
    | 'module'
    | 'layer2'
    | 'product_test'
    | 'failed'
    | 'submitted';

/** DB-driven modules rendered via ModuleQuestionRenderer. */
export type ConfigurableModuleId = Extract<
    QuestionModuleId,
    'purchase_funnel' | 'brand_usage' | 'brand_pricing_behavior' | 'brand_analyzer'
>;

export const CONFIGURABLE_MODULE_IDS: ConfigurableModuleId[] = [
    'purchase_funnel',
    'brand_usage',
    'brand_pricing_behavior',
    'brand_analyzer',
];

export type NextPhaseResult =
    | { type: 'layer2' }
    | { type: 'product_test' }
    | { type: 'module'; moduleId: ConfigurableModuleId }
    | { type: 'submitAll' };

export type PreviousPhaseResult =
    | { type: 'layer1' }
    | { type: 'layer2' }
    | { type: 'product_test' }
    | { type: 'module'; moduleId: ConfigurableModuleId }
    | { type: 'boundary' };

export interface SurveyFlowSession {
    step: SurveyStep;
    currentModuleId: ConfigurableModuleId | null;
    moduleAnswers: Record<string, Record<string, unknown>>;
    moduleStepIndexes: Record<string, number>;
}
