import type { ModuleSnapshots } from '../types/questionModules';

const LEGACY_PF_LABELS: Record<string, string> = {
    aw_q1: 'Top of Mind Awareness',
    aw_q2: 'Spontaneous Awareness',
    aw_q3: 'Prompted Awareness',
    pb_q1: 'Consideration',
    pb_q2: 'Bought (12 months)',
    pb_q3: 'Bought (3 months)',
    pb_q4: 'Most Often Used',
    pf_q1: 'Top of Mind Awareness',
    pf_q2: 'Spontaneous Awareness',
    pf_q3: 'Prompted Awareness',
    pf_q4: 'Consideration',
    pf_q5: 'Bought (12 months)',
    pf_q6: 'Bought (3 months)',
    pf_q7: 'Most Often Used',
};

const MODULE_TITLES: Record<string, string> = {
    purchase_funnel: 'Purchase Funnel',
    brand_usage: 'Brand Usage',
    brand_pricing_behavior: 'Brand Pricing Behavior',
    brand_analyzer: 'Brand Analyzer (Perception & Satisfaction)',
};

/** Build question_id → label map from survey module snapshots. */
export function buildQuestionLabelMap(
    moduleSnapshots?: ModuleSnapshots | Record<string, unknown> | null
): Record<string, string> {
    const labels: Record<string, string> = { ...LEGACY_PF_LABELS };
    if (!moduleSnapshots) return labels;

    Object.entries(moduleSnapshots).forEach(([moduleId, mod]) => {
        const sections = (mod as any)?.sections || [];
        sections.forEach((section: any) => {
            (section.questions || []).forEach((q: any) => {
                const qid = q.question_id;
                if (!qid) return;
                const text = q.label || q.en_text || q.ar_text || qid;
                labels[qid] = String(text).replace(/\[product\]/gi, 'product').replace(/\[Category\]/gi, 'category');
            });
        });
        if (!labels[moduleId]) {
            labels[moduleId] = MODULE_TITLES[moduleId] || moduleId;
        }
    });

    return labels;
}

export function resolveAnswerLabel(
    questionId: string,
    labelMap: Record<string, string>,
    questionMap?: Record<string, { text?: string; label?: string }>
): string {
    const fromMap = questionMap?.[questionId]?.text || questionMap?.[questionId]?.label;
    return fromMap || labelMap[questionId] || questionId;
}

export function collectModuleAnswerSections(
    answers: Record<string, unknown>,
    labelMap: Record<string, string>
): Array<{ moduleId: string; title: string; entries: Array<{ id: string; label: string; value: unknown }> }> {
    const structured = (answers.__structured || answers.structured) as Record<string, unknown> | undefined;
    const moduleAnswers = (structured?.module_answers || {}) as Record<string, Record<string, unknown>>;

    const sections: Array<{ moduleId: string; title: string; entries: Array<{ id: string; label: string; value: unknown }> }> = [];

    const pfLegacy = (structured?.purchase_funnel || answers.purchase_funnel || {}) as Record<string, unknown>;
    const pfBucket = moduleAnswers.purchase_funnel || pfLegacy;
    if (pfBucket && Object.keys(pfBucket).length > 0) {
        sections.push({
            moduleId: 'purchase_funnel',
            title: MODULE_TITLES.purchase_funnel,
            entries: Object.entries(pfBucket)
                .filter(([k]) => !k.startsWith('_'))
                .map(([id, value]) => ({ id, label: resolveAnswerLabel(id, labelMap), value })),
        });
    }

    (['brand_usage', 'brand_pricing_behavior', 'brand_analyzer'] as const).forEach((moduleId) => {
        const bucket = moduleAnswers[moduleId];
        if (!bucket || Object.keys(bucket).length === 0) return;
        sections.push({
            moduleId,
            title: MODULE_TITLES[moduleId] || moduleId,
            entries: Object.entries(bucket).map(([id, value]) => ({
                id,
                label: resolveAnswerLabel(id, labelMap),
                value,
            })),
        });
    });

    return sections;
}
