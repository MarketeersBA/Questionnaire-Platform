import { questionModules } from '../services/api';
import type { ModuleQuestion, ModuleSection, QuestionModule } from '../types/questionModules';
import type { SurveyFormData } from '../pages/CreateSurvey/types';
import { PURCHASE_FUNNEL_QUESTIONS } from '../constants/purchaseFunnel';
import { moduleRollout } from '../constants/moduleRollout';
import { formatModuleQuestionText } from './moduleQuestionUtils';

/** pf_q* → legacy aw_/pb_* keys for analytics backward compatibility */
export const PF_TO_LEGACY_ID: Record<string, string> = {
    pf_q1: 'aw_q1',
    pf_q2: 'aw_q2',
    pf_q3: 'aw_q3',
    pf_q4: 'pb_q1',
    pf_q5: 'pb_q2',
    pf_q6: 'pb_q3',
    pf_q7: 'pb_q4',
};

const LEGACY_TO_PF_ID: Record<string, string> = Object.fromEntries(
    Object.entries(PF_TO_LEGACY_ID).map(([pf, legacy]) => [legacy, pf])
);

const LEGACY_SECTION_MAP: Record<string, { section_id: string; title_en: string; title_ar: string; order: number }> = {
    Awareness: {
        section_id: 'awareness',
        title_en: 'Brand Awareness',
        title_ar: 'الوعي بالعلامة التجارية',
        order: 1,
    },
    'Purchase Behaviour': {
        section_id: 'purchase_behaviour',
        title_en: 'Purchase Behaviour',
        title_ar: 'سلوك الشراء',
        order: 2,
    },
};

const ANALYTICAL_ROLE_BY_LEGACY: Record<string, string> = {
    aw_q1: 'tom',
    aw_q2: 'unaided',
    aw_q3: 'aided',
    pb_q1: 'consideration',
    pb_q2: 'bought_12m',
    pb_q3: 'bought_3m',
    pb_q4: 'mou',
};

let cachedApiModule: QuestionModule | null = null;

/** Runtime fallback when API / snapshot unavailable (seed-compatible pf_q* IDs). */
export function buildFallbackPurchaseFunnelModule(): QuestionModule {
    const sectionBuckets: Record<string, ModuleSection> = {};

    PURCHASE_FUNNEL_QUESTIONS.forEach((q, idx) => {
        const meta = LEGACY_SECTION_MAP[q.section];
        if (!sectionBuckets[meta.section_id]) {
            sectionBuckets[meta.section_id] = {
                ...meta,
                questions: [],
            };
        }

        const questionId = LEGACY_TO_PF_ID[q.id] || q.id;
        sectionBuckets[meta.section_id].questions.push({
            question_id: questionId,
            label: q.section,
            type: q.type,
            ar_text: q.ar_text,
            en_text: q.en_text,
            order: idx + 1,
            required: true,
            analytical_role: ANALYTICAL_ROLE_BY_LEGACY[q.id],
            brand_pipeline: q.brandPipeline
                ? {
                    mode: q.brandPipeline.mode,
                    sources: q.brandPipeline.sources.map((s) => LEGACY_TO_PF_ID[s] || s),
                    strategy: q.brandPipeline.strategy,
                }
                : undefined,
            has_stop: q.hasStop,
            has_other: q.hasOther,
        });
    });

    return {
        module_id: 'purchase_funnel',
        name: 'Purchase Funnel Module',
        version: 0,
        is_active: true,
        sections: Object.values(sectionBuckets).sort((a, b) => a.order - b.order),
        question_count: PURCHASE_FUNNEL_QUESTIONS.length,
    };
}

export async function fetchPurchaseFunnelModule(force = false): Promise<QuestionModule> {
    if (cachedApiModule && !force) return cachedApiModule;
    try {
        const mod = await questionModules.get('purchase_funnel');
        cachedApiModule = mod;
        return mod;
    } catch {
        return buildFallbackPurchaseFunnelModule();
    }
}

export function resolvePurchaseFunnelModuleFromSurvey(survey: any): QuestionModule | null {
    const snapshot = survey?.module_snapshots?.purchase_funnel;
    if (snapshot?.sections?.length) {
        return snapshot as QuestionModule;
    }
    return null;
}

export async function resolvePurchaseFunnelModule(survey?: any): Promise<QuestionModule> {
    const fromSurvey = survey ? resolvePurchaseFunnelModuleFromSurvey(survey) : null;
    if (fromSurvey) return fromSurvey;

    // If survey is present, we are in runtime; NEVER fetch from analyst DB
    if (survey) {
        console.warn('[Orchestration] Purchase Funnel snapshot missing in runtime. Using fallback.');
        return buildFallbackPurchaseFunnelModule();
    }

    if (moduleRollout.pfFromDb()) {
        return fetchPurchaseFunnelModule();
    }
    return buildFallbackPurchaseFunnelModule();
}

export function generateLayer4FromModule(
    module: QuestionModule,
    pfConfig: NonNullable<SurveyFormData['purchase_funnel']>,
    baseConfig: { language: 'en' | 'ar'; category: string }
) {
    const { category_name, is_enabled } = pfConfig;
    if (!is_enabled) return { sections: [] };

    const product = category_name || baseConfig.category || 'Category';
    const { language } = baseConfig;

    return {
        sections: (module.sections || [])
            .sort((a, b) => a.order - b.order)
            .map((section) => ({
                title: language === 'ar' ? section.title_ar || section.title_en : section.title_en,
                module: 'purchase_funnel',
                section_id: section.section_id,
                questions: [...(section.questions || [])]
                    .sort((a, b) => a.order - b.order)
                    .map((q: ModuleQuestion) => ({
                        id: q.question_id,
                        text: formatModuleQuestionText(
                            language === 'ar' ? q.ar_text || q.en_text : q.en_text,
                            { product, category: product }
                        ),
                        type: q.type === 'open_loop' || q.type === 'open_single' ? 'text' : q.type,
                        required: q.required,
                        questionMeta: {
                            nature: 'fixed',
                            section: section.section_id,
                            analytical_role: q.analytical_role,
                            brandPipeline: q.brand_pipeline,
                            hasStop: q.has_stop,
                            hasOther: q.has_other,
                        },
                    })),
            })),
    };
}

/** Merge pf_q* answers with legacy aw_/pb_* keys for submission / analytics. */
export function buildPurchaseFunnelSubmissionPayload(
    answers: Record<string, unknown>
): Record<string, unknown> {
    const payload = { ...answers };
    for (const [pfId, legacyId] of Object.entries(PF_TO_LEGACY_ID)) {
        if (answers[pfId] !== undefined) {
            payload[legacyId] = answers[pfId];
        }
    }
    return payload;
}

export function isPurchaseFunnelEnabled(survey: any): boolean {
    if (!moduleRollout.genericRenderer()) return false;
    if (survey?.module_snapshots?.purchase_funnel) return true;
    if (survey?.purchase_funnel?.is_enabled) return true;
    if (survey?.purchase_funnel_id) return true;
    return (survey?.config?.module_sequence || survey?.module_sequence || []).includes('purchase_funnel');
}
