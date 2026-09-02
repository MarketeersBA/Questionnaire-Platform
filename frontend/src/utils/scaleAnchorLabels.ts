export type ScaleAnchorLanguage = 'en' | 'ar';
export type ScaleAnchorVariant = 'linear' | 'bipolar' | 'jar';
export type ScaleAnchorNumberSeparator = 'dash' | 'dot';

/** Shared respondent label typography — tested for readability regression. */
export const SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES =
    'text-xs md:text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 tracking-normal';

export interface ScaleAnchorDefaults {
    minLabel: string;
    maxLabel: string;
    bipolarLeft: string;
    bipolarRight: string;
    jarLeft: string;
    jarMiddle: string;
    jarRight: string;
}

export function resolveScaleAnchorDefaults(language: ScaleAnchorLanguage): ScaleAnchorDefaults {
    if (language === 'ar') {
        return {
            minLabel: 'ليس على الإطلاق',
            maxLabel: 'للغاية',
            bipolarLeft: 'وحش',
            bipolarRight: 'حلو',
            jarLeft: 'قليل جداً',
            jarMiddle: 'مناسب',
            jarRight: 'كثير جداً',
        };
    }

    return {
        minLabel: 'Not at all',
        maxLabel: 'Extremely',
        bipolarLeft: 'Left',
        bipolarRight: 'Right',
        jarLeft: 'Too Little',
        jarMiddle: 'Suitable',
        jarRight: 'Too Much',
    };
}

export function formatLinearScaleAnchor(
    scaleValue: number,
    label: string | undefined,
    separator: ScaleAnchorNumberSeparator = 'dot',
): string {
    const trimmed = (label || '').trim();
    if (!trimmed) return String(scaleValue);
    return separator === 'dot'
        ? `${scaleValue} · ${trimmed}`
        : `${scaleValue} - ${trimmed}`;
}

export interface ResolvedScalePoint {
    value: number;
    text: string;
    /** The best possible answer — the midpoint of a centered scale. */
    isIdeal: boolean;
}

export interface ResolvedScaleAnchorLabels {
    leftText: string;
    middleText?: string;
    rightText: string;
    direction: 'rtl' | 'ltr';
    /**
     * One entry per scale point, when the question supplies its own labels.
     * Present for centered sensory scales, where each of the five answers has
     * distinct wording and the midpoint is the ideal. When this is set it fully
     * describes the scale and the left/middle/right anchors are redundant.
     */
    points?: ResolvedScalePoint[];
}

/**
 * Build a per-point label set from explicit question labels.
 *
 * Labels are the authoritative description of a scale: they say whether the
 * midpoint or the top is the good answer, which a variant name alone cannot.
 * Returns null when the label count does not match the scale, so a malformed
 * question falls back to anchors instead of rendering a mislabelled scale.
 */
export function resolveScalePoints(options: {
    labels: string[] | undefined;
    scaleMin?: number;
    scaleMax?: number;
    /** Centered scales mark their midpoint as the ideal answer. */
    idealPoint?: number | null;
}): ResolvedScalePoint[] | null {
    const { labels, scaleMin = 1, scaleMax = 5, idealPoint = null } = options;
    if (!labels || labels.length === 0) return null;

    const expected = scaleMax - scaleMin + 1;
    if (labels.length !== expected) return null;

    return labels.map((text, index) => {
        const value = scaleMin + index;
        return { value, text: text.trim(), isIdeal: idealPoint === value };
    });
}

export function resolveScaleAnchorLabels(options: {
    language: ScaleAnchorLanguage;
    variant?: ScaleAnchorVariant;
    scaleMin?: number;
    scaleMax?: number;
    minLabel?: string;
    maxLabel?: string;
    leftLabel?: string;
    rightLabel?: string;
    middleLabel?: string;
    numberSeparator?: ScaleAnchorNumberSeparator;
    /** Per-point labels. When supplied these describe the scale completely. */
    pointLabels?: string[];
    /** Which point is the best answer; the midpoint on a centered scale. */
    idealPoint?: number | null;
}): ResolvedScaleAnchorLabels {
    const {
        language,
        variant = 'linear',
        scaleMin = 1,
        scaleMax = 5,
        minLabel,
        maxLabel,
        leftLabel,
        rightLabel,
        middleLabel,
        numberSeparator = 'dot',
        pointLabels,
        idealPoint = null,
    } = options;

    const defaults = resolveScaleAnchorDefaults(language);

    // Explicit per-point labels win over every variant heuristic. This is how a
    // sensory scale states that its midpoint is the ideal, and how purchase
    // intent states that its top is — the labels say it, nothing infers it.
    const points = resolveScalePoints({
        labels: pointLabels,
        scaleMin,
        scaleMax,
        idealPoint,
    });

    if (points) {
        return {
            leftText: points[0].text,
            middleText: points.find((p) => p.isIdeal)?.text,
            rightText: points[points.length - 1].text,
            // Points are laid out left-to-right to match the slider track,
            // which does not flip for Arabic.
            direction: 'ltr',
            points,
        };
    }

    if (variant === 'jar') {
        // Legacy path for questions authored before per-point labels existed.
        // `minLabel`/`maxLabel` are honoured here because that is what
        // HorizontalScaleSlider actually forwards — previously only
        // leftLabel/rightLabel were read, so author-supplied anchors were
        // silently replaced by the generic defaults.
        return {
            leftText: formatLinearScaleAnchor(
                1, leftLabel || minLabel || defaults.jarLeft, numberSeparator,
            ),
            middleText: formatLinearScaleAnchor(
                3, middleLabel || defaults.jarMiddle, numberSeparator,
            ),
            rightText: formatLinearScaleAnchor(
                5, rightLabel || maxLabel || defaults.jarRight, numberSeparator,
            ),
            direction: 'ltr',
        };
    }

    if (variant === 'bipolar') {
        return {
            leftText: (leftLabel || minLabel || defaults.bipolarLeft).trim(),
            rightText: (rightLabel || maxLabel || defaults.bipolarRight).trim(),
            direction: language === 'ar' ? 'rtl' : 'ltr',
        };
    }

    return {
        leftText: formatLinearScaleAnchor(
            scaleMin,
            minLabel || defaults.minLabel,
            numberSeparator,
        ),
        rightText: formatLinearScaleAnchor(
            scaleMax,
            maxLabel || defaults.maxLabel,
            numberSeparator,
        ),
        // Keep linear scale label geometry aligned with slider direction.
        // Slider min/max is always left→right, including Arabic surveys.
        direction: 'ltr',
    };
}

/** Accessible range input label referencing domain anchors. */
export function buildScaleRangeAriaLabel(options: {
    language: ScaleAnchorLanguage;
    scaleMax?: number;
    minLabel?: string;
    maxLabel?: string;
}): string {
    const { leftText, rightText } = resolveScaleAnchorLabels({
        language: options.language,
        variant: 'linear',
        scaleMax: options.scaleMax,
        minLabel: options.minLabel,
        maxLabel: options.maxLabel,
    });
    return options.language === 'ar'
        ? `مقياس من ${leftText} إلى ${rightText}`
        : `Scale from ${leftText} to ${rightText}`;
}

export function buildScaleRangeAriaValueText(
    value: number,
    scaleMax: number,
    language: ScaleAnchorLanguage,
): string {
    return language === 'ar'
        ? `القيمة ${value} من ${scaleMax}`
        : `Value ${value} of ${scaleMax}`;
}
