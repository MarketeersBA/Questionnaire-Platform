import type { BrandPipelineCarrier } from './purchaseFunnelBrandLogic';
import type {
    McqAnswerItem,
    ModuleAnswerValue,
    ModulePlaceholderContext,
    SpecifyAnswer,
} from '../types/moduleQuestions';
import type { ModuleQuestion, ModuleSection, QuestionOption } from '../types/questionModules';
import { isOpenEndAnswerComplete } from './voiceQuestions';

// ── Type guards ──────────────────────────────────────────────────────────────

export const isSpecifyAnswer = (value: unknown): value is SpecifyAnswer =>
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'otherText' in value &&
    typeof (value as SpecifyAnswer).value === 'string';

export const isSpecifyObject = (value: unknown): value is SpecifyAnswer =>
    isSpecifyAnswer(value);

// ── Placeholder formatting ───────────────────────────────────────────────────

export function formatModuleQuestionText(
    text: string,
    ctx: ModulePlaceholderContext = {}
): string {
    if (!text) return '';
    const product = ctx.product || ctx.category || 'product';
    const category = ctx.category || ctx.product || 'Category';
    const brand = ctx.brand || 'Brand';

    return text
        .replace(/\[product\]/gi, product)
        .replace(/\[Product\]/gi, product)
        .replace(/\[Category\]/gi, category)
        .replace(/\[brand\]/gi, brand)
        .replace(/\[Brand\]/gi, brand)
        .replace(/\(المنتج\)/g, product)
        .replace(/المنتج/g, product)
        .replace(/\(البراند\)/g, brand)
        .replace(/البراند/g, brand);
}

export function getQuestionDisplayText(
    question: ModuleQuestion,
    language: 'en' | 'ar',
    ctx?: ModulePlaceholderContext
): string {
    const raw = language === 'ar' ? question.ar_text || question.en_text : question.en_text;
    return formatModuleQuestionText(raw, ctx);
}

export function getOptionDisplayLabel(
    option: QuestionOption,
    language: 'en' | 'ar'
): string {
    return language === 'ar'
        ? option.ar_label || option.en_label
        : option.en_label || option.ar_label;
}

// ── Specify answer contract ──────────────────────────────────────────────────

export function normalizeSpecifyAnswer(
    value: string,
    otherText: string
): SpecifyAnswer {
    return {
        value,
        otherText: otherText.trim(),
    };
}

export function getSpecifyValue(answer: ModuleAnswerValue | undefined): string | null {
    if (isSpecifyAnswer(answer)) return answer.value;
    return null;
}

export function getSpecifyOtherText(answer: ModuleAnswerValue | undefined): string {
    if (isSpecifyAnswer(answer)) return answer.otherText || '';
    return '';
}

// ── Module structure helpers ─────────────────────────────────────────────────

export function flattenModuleQuestions(sections: ModuleSection[]): ModuleQuestion[] {
    const sortedSections = [...sections].sort((a, b) => a.order - b.order);
    const flat: ModuleQuestion[] = [];
    for (const section of sortedSections) {
        const sortedQs = [...(section.questions || [])].sort((a, b) => a.order - b.order);
        flat.push(...sortedQs);
    }
    return flat;
}

export function asBrandPipelineCarrier(question: ModuleQuestion): BrandPipelineCarrier {
    return {
        id: question.question_id,
        type: question.type,
        brandPipeline: question.brand_pipeline,
        hasOther: question.has_other,
    };
}

// ── MCQ / SCQ selection helpers ──────────────────────────────────────────────

export function isMcqItemSelected(
    answer: ModuleAnswerValue | undefined,
    optionValue: string
): boolean {
    if (!Array.isArray(answer)) return false;
    return answer.some((item) =>
        typeof item === 'string' ? item === optionValue : item.value === optionValue
    );
}

export function isScqOptionSelected(
    answer: ModuleAnswerValue | undefined,
    optionValue: string
): boolean {
    if (typeof answer === 'string') return answer === optionValue;
    if (isSpecifyAnswer(answer)) return answer.value === optionValue;
    return false;
}

export function toggleMcqOption(
    current: ModuleAnswerValue | undefined,
    option: QuestionOption
): McqAnswerItem[] {
    const list: McqAnswerItem[] = Array.isArray(current)
        ? [...current]
        : [];

    const idx = list.findIndex((item) =>
        typeof item === 'string' ? item === option.value : item.value === option.value
    );

    if (idx >= 0) {
        list.splice(idx, 1);
        return list;
    }

    if (option.allows_specify) {
        return [...list, normalizeSpecifyAnswer(option.value, '')];
    }

    return [...list, option.value];
}

export function selectScqOption(
    option: QuestionOption,
    otherText = ''
): ModuleAnswerValue {
    if (option.allows_specify) {
        return normalizeSpecifyAnswer(option.value, otherText);
    }
    return option.value;
}

export function updateSpecifyOtherText(
    current: ModuleAnswerValue | undefined,
    optionValue: string,
    otherText: string,
    isMcq: boolean
): ModuleAnswerValue {
    if (isMcq) {
        const list: McqAnswerItem[] = Array.isArray(current) ? [...current] : [];
        const idx = list.findIndex(
            (item) => isSpecifyAnswer(item) && item.value === optionValue
        );
        if (idx >= 0) {
            list[idx] = normalizeSpecifyAnswer(optionValue, otherText);
            return list;
        }
        return [...list, normalizeSpecifyAnswer(optionValue, otherText)];
    }

    return normalizeSpecifyAnswer(optionValue, otherText);
}

// ── Validation ───────────────────────────────────────────────────────────────

function isNonEmptyString(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

function optionRequiresSpecifyText(option?: QuestionOption): boolean {
    return option?.allows_specify === true;
}

function isMcqItemComplete(item: McqAnswerItem, option?: QuestionOption): boolean {
    if (typeof item === 'string') return isNonEmptyString(item);
    if (!isNonEmptyString(item.value)) return false;
    if (optionRequiresSpecifyText(option)) return isNonEmptyString(item.otherText);
    return true;
}

export function findMissingSpecifyOption(
    question: ModuleQuestion,
    answer: ModuleAnswerValue | undefined
): QuestionOption | null {
    if (question.type === 'scq' && isSpecifyAnswer(answer)) {
        const opt = question.options?.find((o) => o.value === answer.value);
        if (optionRequiresSpecifyText(opt) && !isNonEmptyString(answer.otherText)) {
            return opt ?? null;
        }
    }

    if (question.type === 'mcq' && Array.isArray(answer)) {
        for (const item of answer) {
            if (!isSpecifyAnswer(item)) continue;
            const opt = question.options?.find((o) => o.value === item.value);
            if (optionRequiresSpecifyText(opt) && !isNonEmptyString(item.otherText)) {
                return opt ?? null;
            }
        }
    }

    return null;
}

export function isAnswerComplete(
    question: ModuleQuestion,
    answer: ModuleAnswerValue | undefined
): boolean {
    if (answer === undefined || answer === null) return !question.required;

    switch (question.type) {
        case 'open_single':
            if (typeof answer === 'object' && answer !== null && !Array.isArray(answer)) {
                return isOpenEndAnswerComplete(answer);
            }
            return isNonEmptyString(answer);

        case 'open_loop': {
            if (!Array.isArray(answer)) return false;
            const filled = answer.filter((v) => isNonEmptyString(v));
            return filled.length > 0;
        }

        case 'scq': {
            if (typeof answer === 'string') return isNonEmptyString(answer);
            if (isSpecifyAnswer(answer)) {
                const opt = question.options?.find((o) => o.value === answer.value);
                return isNonEmptyString(answer.value) && !findMissingSpecifyOption(question, answer);
            }
            return false;
        }

        case 'mcq': {
            if (!Array.isArray(answer) || answer.length === 0) return false;
            return answer.every((item) => {
                if (typeof item === 'string') return isNonEmptyString(item);
                const opt = question.options?.find((o) => o.value === item.value);
                return isMcqItemComplete(item, opt);
            });
        }

        case 'grid': {
            if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return false;
            const entries = Object.values(answer as Record<string, string[]>);
            return entries.some(selectionList => selectionList.length > 0);
        }

        case 'loop': {
            if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return false;
            const entries = Object.values(answer as Record<string, unknown>);
            return entries.some(val => val !== undefined && val !== null && (typeof val === 'string' ? val.trim() !== '' : true));
        }

        default:
            return false;
    }
}

export function validateCurrentStep(
    question: ModuleQuestion | null,
    answers: Record<string, ModuleAnswerValue | undefined>
): boolean {
    if (!question) return true;
    return isAnswerComplete(question, answers[question.question_id]);
}

// ── Persistence ──────────────────────────────────────────────────────────────

export interface ModuleSurveyPersistedState {
    answers: Record<string, ModuleAnswerValue>;
    stepIndex: number;
}

export function loadModuleSurveyState(
    persistenceKey: string
): ModuleSurveyPersistedState | null {
    try {
        const raw = localStorage.getItem(persistenceKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ModuleSurveyPersistedState;
        if (typeof parsed.stepIndex !== 'number' || !parsed.answers) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function saveModuleSurveyState(
    persistenceKey: string,
    state: ModuleSurveyPersistedState
): void {
    try {
        localStorage.setItem(persistenceKey, JSON.stringify(state));
    } catch {
        // Quota or private mode — ignore
    }
}
