export type ScaleAnchorLanguage = 'en' | 'ar';
export type ScaleAnchorVariant = 'linear' | 'bipolar';
export type ScaleAnchorNumberSeparator = 'dash' | 'dot';

/** Shared respondent label typography — tested for readability regression. */
export const SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES =
    'text-sm md:text-base font-semibold leading-snug text-slate-600 dark:text-slate-300 tracking-normal';

export interface ScaleAnchorDefaults {
    minLabel: string;
    maxLabel: string;
    bipolarLeft: string;
    bipolarRight: string;
}

export function resolveScaleAnchorDefaults(language: ScaleAnchorLanguage): ScaleAnchorDefaults {
    if (language === 'ar') {
        return {
            minLabel: 'ليس على الإطلاق',
            maxLabel: 'للغاية',
            bipolarLeft: 'وحش',
            bipolarRight: 'حلو',
        };
    }

    return {
        minLabel: 'Not at all',
        maxLabel: 'Extremely',
        bipolarLeft: 'Left',
        bipolarRight: 'Right',
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

export interface ResolvedScaleAnchorLabels {
    leftText: string;
    rightText: string;
    direction: 'rtl' | 'ltr';
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
    numberSeparator?: ScaleAnchorNumberSeparator;
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
        numberSeparator = 'dot',
    } = options;

    const defaults = resolveScaleAnchorDefaults(language);

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
