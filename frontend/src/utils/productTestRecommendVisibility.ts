import type { ProductTestQuestion, PackageTestQuestion } from '../types/productTest';
import type { ProductTestRespondentQuestion, ProductTestVisibilityCondition } from '../types/productTestRespondent';

/** Show why-recommend open-end when recommendation scale is in this inclusive range. */
export const RECOMMEND_OPEN_END_VISIBLE_MIN = 6;
export const RECOMMEND_OPEN_END_VISIBLE_MAX = 10;

const RECOMMEND_SCALE_PATTERN =
    /\b(recommend|recommendation|likelihood\s+to\s+recommend|nps|family|friends|صديق|عائل|أصدقاء|توصي|توصية)\b/i;

const WHY_RECOMMEND_OPEN_PATTERN =
    /\b(why|reason|explain|what\s+made|لماذا|سبب|ما\s+الذي).*(recommend|family|friends|صديق|عائل|أصدقاء|توصي|توصية)\b/i;

const RECOMMEND_OPEN_ONLY_PATTERN =
    /\b(recommend|family|friends|صديق|عائل|أصدقاء|توصي|توصية)\b/i;

type BankQuestion = ProductTestQuestion | PackageTestQuestion;

function normalizeQuestionText(text: string): string {
    return text.trim().toLowerCase();
}

function isScaleMappedType(type: string): boolean {
    return type === 'scale';
}

function isOpenEndMappedType(type: string): boolean {
    return type === 'open-ended' || type === 'text';
}

function bankQuestionText(q: BankQuestion, language: 'en' | 'ar'): string {
    return language === 'ar' ? (q.ar_text || q.en_text) : q.en_text;
}

function isRecommendScaleBankQuestion(q: BankQuestion, language: 'en' | 'ar' = 'en'): boolean {
    const qType = (q.question_type || '').toLowerCase();
    if (!qType.includes('scale')) return false;
    return RECOMMEND_SCALE_PATTERN.test(normalizeQuestionText(bankQuestionText(q, language)));
}

function isWhyRecommendOpenEndBankQuestion(q: BankQuestion, language: 'en' | 'ar' = 'en'): boolean {
    const qType = (q.question_type || '').toLowerCase();
    const isOpen =
        qType.includes('open-end')
        || qType.includes('text')
        || (qType.includes('mcq') && String(q.en_options || '').toLowerCase().includes('open-end'));
    if (!isOpen) return false;
    const text = normalizeQuestionText(bankQuestionText(q, language));
    return WHY_RECOMMEND_OPEN_PATTERN.test(text)
        || (RECOMMEND_OPEN_ONLY_PATTERN.test(text) && /\b(why|reason|explain|لماذا|سبب)\b/i.test(text));
}

export function isRecommendScaleRespondentQuestion(question: ProductTestRespondentQuestion): boolean {
    if (!isScaleMappedType(question.type)) return false;
    return RECOMMEND_SCALE_PATTERN.test(normalizeQuestionText(question.text));
}

export function isWhyRecommendOpenEndRespondentQuestion(question: ProductTestRespondentQuestion): boolean {
    if (!isOpenEndMappedType(question.type)) return false;
    const text = normalizeQuestionText(question.text);
    return WHY_RECOMMEND_OPEN_PATTERN.test(text)
        || (RECOMMEND_OPEN_ONLY_PATTERN.test(text) && /\b(why|reason|explain|لماذا|سبب)\b/i.test(text));
}

export function buildRecommendVisibilityCondition(
    dependsOnQuestionId: string,
): ProductTestVisibilityCondition {
    return {
        dependsOnQuestionId,
        min: RECOMMEND_OPEN_END_VISIBLE_MIN,
        max: RECOMMEND_OPEN_END_VISIBLE_MAX,
    };
}

/**
 * Pair recommendation scale + why-recommend open-end questions within a section.
 * Mutates visibilityCondition on matched open-ends using scoped respondent ids.
 */
export function applyRecommendVisibilityConditions(
    questions: ProductTestRespondentQuestion[],
    bankEntries?: Array<{ bankId: string; bankQuestion: BankQuestion; language?: 'en' | 'ar' }>,
): ProductTestRespondentQuestion[] {
    if (questions.length === 0) return questions;

    const bankById = new Map<string, BankQuestion>();
    const languageById = new Map<string, 'en' | 'ar'>();
    bankEntries?.forEach(({ bankId, bankQuestion, language = 'en' }) => {
        bankById.set(bankId, bankQuestion);
        languageById.set(bankId, language);
    });

    const result = questions.map((question) => ({ ...question }));
    let lastRecommendScaleId: string | null = null;

    for (const question of result) {
        const bankId = question.canonicalQuestionId || question.id;
        const bankQ = bankById.get(bankId);
        const language = languageById.get(bankId) || 'en';

        const isScale = bankQ
            ? isRecommendScaleBankQuestion(bankQ, language)
            : isRecommendScaleRespondentQuestion(question);
        if (isScale) {
            lastRecommendScaleId = question.id;
            continue;
        }

        const isWhyOpen = bankQ
            ? isWhyRecommendOpenEndBankQuestion(bankQ, language)
            : isWhyRecommendOpenEndRespondentQuestion(question);

        if (isWhyOpen && lastRecommendScaleId) {
            question.visibilityCondition = buildRecommendVisibilityCondition(lastRecommendScaleId);
        }
    }

    return result;
}
