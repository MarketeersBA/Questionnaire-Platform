import type { ModuleQuestion, ModuleSection, QuestionModule, QuestionOption } from '../types/questionModules';
import { moduleRollout } from '../constants/moduleRollout';
import { generateSchemaSectionsFromModule } from './moduleSchemaUtils';
import { fetchQuestionModuleDoc, resolveQuestionModule } from './questionModuleFetch';

const MODULE_ID = 'brand_pricing_behavior';

const PRICING_OPTION_LABELS: Record<string, Record<string, { en: string; ar: string }>> = {
    cb_q1: {
        less_than_100_egp: { en: 'Less than 100 EGP', ar: 'أقل من 100 جنيه' },
        '100_200_egp': { en: '100 – 200 EGP', ar: '100 – 200 جنيه' },
        '200_300_egp': { en: '200 – 300 EGP', ar: '200 – 300 جنيه' },
        '300_400_egp': { en: '300 – 400 EGP', ar: '300 – 400 جنيه' },
        more_than_400_egp: { en: 'More than 400 EGP', ar: 'أكثر من 400 جنيه' },
    },
    cb_q2: {
        buy_as_needed: { en: 'I buy as needed', ar: 'أشتري حسب الحاجة' },
        buy_bulk_store: { en: 'I buy in bulk and store', ar: 'أشتري بكميات وأخزن' },
        buy_promotions: { en: 'I buy based on promotions and discounts', ar: 'أشتري بناءً على العروض والخصومات' },
    },
    cb_q3: {
        grocery_store: { en: 'Grocery store', ar: 'بقالة' },
        supermarket_hypermarket: { en: 'Supermarket/Hypermarket', ar: 'سوبر ماركت/هايبر ماركت' },
        kiosk: { en: 'Kiosk', ar: 'كشك' },
        online_other: { en: 'Online (Specify)', ar: 'أونلاين (حدد)' },
        pharmacy: { en: 'Pharmacy', ar: 'صيدلية' },
        other: { en: 'Other (Specify)', ar: 'أخرى (حدد)' },
    },
    cb_q4: {
        small: { en: 'Small', ar: 'صغير' },
        medium: { en: 'Medium', ar: 'متوسط' },
        large: { en: 'Large', ar: 'كبير' },
        based_on_availability: { en: 'Based on availability', ar: 'حسب التوفر' },
    },
};

const SPECIFY_VALUES = new Set(['online_other', 'other']);

function buildOptions(qid: string): QuestionOption[] {
    const labels = PRICING_OPTION_LABELS[qid] || {};
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
        options: buildOptions(question_id),
    };
}

/** Offline fallback aligned with seeded `brand_pricing_behavior` module (cb_q1–cb_q4). */
export function buildFallbackBrandPricingBehaviorModule(): QuestionModule {
    const section: ModuleSection = {
        section_id: 'pricing_behavior',
        title_en: 'Pricing & Purchase Behavior',
        title_ar: 'التسعير وسلوك الشراء',
        order: 1,
        questions: [
            q('cb_q1', 'Monthly Budget', 'scq',
                'What is your typical monthly budget for [product]?',
                'إيه الميزانية الشهرية المعتادة لشراء (المنتج)؟', 1),
            q('cb_q2', 'Stocking Behavior', 'scq',
                'How do you usually stock [product]?',
                'إزاي بتوفر (المنتج) عادة؟', 2),
            q('cb_q3', 'Purchasing Places', 'mcq',
                'Where do you usually buy [product]?',
                'منين بتشتري (المنتج) عادة؟', 3),
            q('cb_q4', 'Pack Sizes', 'scq',
                'What pack size do you usually buy for [product]?',
                'إيه حجم العبوة اللي بتشتريها عادة لـ(المنتج)؟', 4),
        ],
    };

    return {
        module_id: MODULE_ID,
        name: 'Brand Pricing Behavior Module',
        version: 0,
        is_active: true,
        sections: [section],
        question_count: section.questions.length,
    };
}

export async function fetchBrandPricingBehaviorModule(force = false): Promise<QuestionModule> {
    return fetchQuestionModuleDoc(MODULE_ID, buildFallbackBrandPricingBehaviorModule, force);
}

export async function resolveBrandPricingBehaviorModule(survey?: any): Promise<QuestionModule> {
    const module = await resolveQuestionModule(MODULE_ID, buildFallbackBrandPricingBehaviorModule, survey);
    return enrichSpecifyOptions(module);
}

export function generateLayer6FromModule(
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

export function isBrandPricingBehaviorEnabled(survey: any): boolean {
    if (!moduleRollout.genericRenderer() || !moduleRollout.usagePricing()) return false;
    if (survey?.module_snapshots?.brand_pricing_behavior) return true;
    if (survey?.brand_pricing_behavior?.is_enabled) return true;
    return (survey?.config?.module_sequence || survey?.module_sequence || []).includes('brand_pricing_behavior');
}
