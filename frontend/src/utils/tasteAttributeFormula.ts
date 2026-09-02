/**
 * Draft-generation for analyst-added taste-test attributes.
 *
 * Every centered attribute in the source document follows one shape: two
 * opposing poles with a "this is right for me" midpoint.
 *
 *     1  {low} + intensifier      2  {low}      3  {middle}      4  {high}      5  {high} جدا
 *
 * Two pole styles occur, and they take different intensifiers at point 1:
 *
 *   negation  low = "مش مسكرة"  ->  "مش مسكرة خالص"   (خالص)
 *   bipolar   low = "فاتح"      ->  "فاتح جدا"        (جدا)
 *
 * The source document is not perfectly consistent — saltiness uses "كفاية"
 * where the other negations use "خالص", colour uses "قوى" where the other
 * bipolars use "جدا", and the midpoint appears as مناسب لى / مناسب ليا /
 * مناسبة لي depending on the attribute's gender. Arabic agreement is not
 * mechanically derivable, so everything here produces an EDITABLE DRAFT: the
 * generator gets the analyst most of the way, and the builder lets them fix
 * the rest. `lowIntensifierAr` exists precisely so the exceptions can be
 * reproduced without fighting the default.
 */

export type PoleStyle = 'negation' | 'bipolar';

/** Most frequent midpoint wording in the source document. */
export const DEFAULT_MIDDLE_AR = 'مناسب لى';
export const DEFAULT_MIDDLE_EN = 'Just right for me';

const NEGATION_PREFIX = 'مش';
const INTENSIFIER_NEGATION = 'خالص';
const INTENSIFIER_BIPOLAR = 'جدا';
const INTENSIFIER_HIGH = 'جدا';

/** Instruction shown under a centered scale, verbatim from the source document. */
export const CENTERED_INSTRUCTION_AR =
    '(اختر الإجابة الأنسب لك، والاختيار الأوسط يعني أنها مناسبة لك تمامًا)';
export const CENTERED_INSTRUCTION_EN =
    '(Pick the answer that suits you best - the middle option means it is exactly right for you)';

export interface CenteredAttributeInput {
    /** Attribute name, e.g. "الحموضة" / "Acidity". */
    attributeAr: string;
    attributeEn?: string;
    /** Low pole, e.g. "مش حامض" (negation) or "فاتح" (bipolar). */
    lowAr: string;
    /** High pole, e.g. "حامض" or "غامق". */
    highAr: string;
    lowEn?: string;
    highEn?: string;
    middleAr?: string;
    middleEn?: string;
    /** Override point 1's intensifier to match a house exception. */
    lowIntensifierAr?: string;
}

export interface GeneratedAttribute {
    ar_text: string;
    en_text: string;
    instruction_ar: string;
    instruction_en: string;
    point_labels_ar: string[];
    point_labels_en: string[];
    scale_shape: 'centered';
    scale_min: 1;
    scale_max: 5;
    /** The midpoint — the best possible answer on a centered scale. */
    ideal_point: 3;
}

const clean = (value: string | undefined): string => (value ?? '').trim();

/** A pole reads as a negation when it is phrased as "not X". */
export function detectPoleStyle(lowAr: string): PoleStyle {
    return clean(lowAr).startsWith(NEGATION_PREFIX) ? 'negation' : 'bipolar';
}

/** Default intensifier for point 1, chosen from the pole style. */
export function defaultLowIntensifier(lowAr: string): string {
    return detectPoleStyle(lowAr) === 'negation'
        ? INTENSIFIER_NEGATION
        : INTENSIFIER_BIPOLAR;
}

/** The five Arabic labels, low to high. */
export function buildCenteredLabelsAr(input: CenteredAttributeInput): string[] {
    const low = clean(input.lowAr);
    const high = clean(input.highAr);
    const middle = clean(input.middleAr) || DEFAULT_MIDDLE_AR;
    const intensifier = clean(input.lowIntensifierAr) || defaultLowIntensifier(low);

    return [
        `${low} ${intensifier}`.trim(),
        low,
        middle,
        high,
        `${high} ${INTENSIFIER_HIGH}`.trim(),
    ];
}

/** The five English labels, low to high. Falls back to the Arabic poles. */
export function buildCenteredLabelsEn(input: CenteredAttributeInput): string[] {
    const low = clean(input.lowEn) || clean(input.lowAr);
    const high = clean(input.highEn) || clean(input.highAr);
    const middle = clean(input.middleEn) || DEFAULT_MIDDLE_EN;

    return [`Far too ${low}`, `Too ${low}`, middle, high, `Far too ${high}`];
}

/** Question stem used by every rated attribute in the source document. */
export function buildQuestionTextAr(attributeAr: string): string {
    return `ما مدى تقيمك على نسبه ${clean(attributeAr)}؟`;
}

export function buildQuestionTextEn(attributeEn: string): string {
    return `How do you rate the level of ${clean(attributeEn)}?`;
}

/** Full editable draft for a new centered attribute. */
export function generateCenteredAttribute(
    input: CenteredAttributeInput,
): GeneratedAttribute {
    return {
        ar_text: buildQuestionTextAr(input.attributeAr),
        en_text: buildQuestionTextEn(clean(input.attributeEn) || clean(input.attributeAr)),
        instruction_ar: CENTERED_INSTRUCTION_AR,
        instruction_en: CENTERED_INSTRUCTION_EN,
        point_labels_ar: buildCenteredLabelsAr(input),
        point_labels_en: buildCenteredLabelsEn(input),
        scale_shape: 'centered',
        scale_min: 1,
        scale_max: 5,
        ideal_point: 3,
    };
}

/**
 * Hedonic "Overall X" companion, the 1-10 summary every main attribute gets.
 */
export function generateOverallAttribute(attributeAr: string, attributeEn?: string) {
    return {
        ar_text: `ما هو تقييمك العام لل${clean(attributeAr)}؟`,
        en_text: `What is your overall rating of the ${clean(attributeEn) || clean(attributeAr)}?`,
        scale_shape: 'hedonic' as const,
        scale_min: 1,
        scale_max: 10,
        ar_min_label: 'لا يعجبني علي الاطلاق',
        ar_max_label: 'يعجبني جدا',
        en_min_label: 'Do not like it at all',
        en_max_label: 'Like it very much',
        ideal_point: 10,
    };
}
