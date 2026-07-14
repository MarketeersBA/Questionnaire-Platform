import type { ModuleQuestion, ModuleSection, QuestionModule, QuestionOption } from '../types/questionModules';
import { moduleRollout } from '../constants/moduleRollout';
import { generateSchemaSectionsFromModule } from './moduleSchemaUtils';
import { fetchQuestionModuleDoc, resolveQuestionModule } from './questionModuleFetch';

const MODULE_ID = 'brand_usage';

const USAGE_OPTION_LABELS: Record<string, Record<string, { en: string; ar: string }>> = {
    us_q1: {
        today: { en: 'Today', ar: 'النهاردة' },
        last_week: { en: 'Last week', ar: 'الأسبوع اللي فات' },
        last_month: { en: 'Last month', ar: 'الشهر اللي فات' },
        more_than_month: { en: 'More than a month ago', ar: 'أكتر من شهر' },
    },
    us_q2: {
        every_day: { en: 'Every day', ar: 'كل يوم' },
        two_three_per_week: { en: 'Two or three times a week', ar: 'مرتين أو تلاتة في الأسبوع' },
        once_week: { en: 'Once a week', ar: 'مرة في الأسبوع' },
        every_two_weeks: { en: 'Every two weeks', ar: 'كل أسبوعين' },
        every_three_weeks: { en: 'Every three weeks', ar: 'كل تلات أسابيع' },
        every_month: { en: 'Every month', ar: 'كل شهر' },
    },
    us_q3: {
        morning: { en: 'Morning', ar: 'الصبح' },
        midday: { en: 'Midday', ar: 'الظهر' },
        night: { en: 'Night', ar: 'بالليل' },
        before_bedtime: { en: 'Before bedtime', ar: 'قبل النوم' },
        as_needed: { en: 'As needed (Specify)', ar: 'حسب الحاجة (حدد)' },
    },
    us_q4: {
        daily: { en: 'Daily', ar: 'يومياً' },
        outings_occasions: { en: 'During outings and special occasions', ar: 'في الخروجات والمناسبات' },
        before_work_uni: { en: 'Before going to work/university/errands', ar: 'قبل الشغل/الجامعة/المشاوير' },
        while_traveling: { en: 'While traveling or on trips', ar: 'أثناء السفر أو الرحلات' },
        when_needed: { en: 'When needed (Specify)', ar: 'عند الحاجة (حدد)' },
    },
};

const SPECIFY_VALUES = new Set(['as_needed', 'when_needed']);

function buildOptions(qid: string): QuestionOption[] {
    const labels = USAGE_OPTION_LABELS[qid] || {};
    return Object.entries(labels).map(([value, label], order) => ({
        value,
        en_label: label.en,
        ar_label: label.ar,
        allows_specify: SPECIFY_VALUES.has(value),
        order,
    }));
}

function enrichSpecifyOptions(module: QuestionModule): QuestionModule {
    return {
        ...module,
        sections: module.sections.map((section) => ({
            ...section,
            questions: section.questions.map((question) => ({
                ...question,
                options: question.options?.map((option) => ({
                    ...option,
                    allows_specify: option.allows_specify || SPECIFY_VALUES.has(option.value),
                })),
            })),
        })),
    };
}

function q(
    question_id: string,
    label: string,
    type: ModuleQuestion['type'],
    en_text: string,
    ar_text: string,
    order: number
): ModuleQuestion {
    return {
        question_id,
        label,
        type,
        en_text,
        ar_text,
        order,
        required: true,
        options: type === 'scq' || type === 'mcq' ? buildOptions(question_id) : undefined,
    };
}

/** Offline fallback aligned with seeded `brand_usage` module (us_q1–us_q4). */
export function buildFallbackBrandUsageModule(): QuestionModule {
    const section: ModuleSection = {
        section_id: 'usage',
        title_en: 'Usage',
        title_ar: 'الاستخدام',
        order: 1,
        questions: [
            q('us_q1', 'Last Time Used', 'scq',
                'When was the last time you used [product]?',
                'أمتى استخدمت (المنتج) أخر مرة؟', 1),
            q('us_q2', 'Usage Frequency', 'scq',
                'How often do you typically use [product]?',
                'ي العادي بتستخدم (المنتج) كل قد إيه؟', 2),
            q('us_q3', 'Usage Timing', 'mcq',
                'Typically, at what time of the day do you use [product]?',
                'ي العادي بتستخدم (المنتج) في أني وقت من اليوم؟', 3),
            q('us_q4', 'Usage Occasion', 'mcq',
                'On what occasions do you typically use [product]?',
                'في أي مناسبات بتستخدم (المنتج) عادة؟', 4),
        ],
    };

    return {
        module_id: MODULE_ID,
        name: 'Brand Usage Module',
        version: 0,
        is_active: true,
        sections: [section],
        question_count: section.questions.length,
    };
}

export async function fetchBrandUsageModule(force = false): Promise<QuestionModule> {
    return fetchQuestionModuleDoc(MODULE_ID, buildFallbackBrandUsageModule, force);
}

export async function resolveBrandUsageModule(survey?: any): Promise<QuestionModule> {
    const module = await resolveQuestionModule(MODULE_ID, buildFallbackBrandUsageModule, survey);
    return enrichSpecifyOptions(module);
}

export function generateLayer5FromModule(
    module: QuestionModule,
    isEnabled: boolean,
    baseConfig: { language: 'en' | 'ar'; category: string; brand: string },
    selectedQuestions?: string[]
) {
    if (!isEnabled) return { sections: [] };

    let filteredModule = module;
    if (selectedQuestions && selectedQuestions.length > 0) {
        filteredModule = {
            ...module,
            sections: module.sections.map(section => ({
                ...section,
                questions: section.questions.filter(q => selectedQuestions.includes(q.question_id))
            }))
        };
    }

    return generateSchemaSectionsFromModule(filteredModule, MODULE_ID, baseConfig);
}

export function isBrandUsageEnabled(survey: any): boolean {
    if (!moduleRollout.genericRenderer() || !moduleRollout.usagePricing()) return false;
    if (survey?.module_snapshots?.brand_usage) return true;
    if (survey?.brand_usage?.is_enabled) return true;
    return (survey?.config?.module_sequence || survey?.module_sequence || []).includes('brand_usage');
}
