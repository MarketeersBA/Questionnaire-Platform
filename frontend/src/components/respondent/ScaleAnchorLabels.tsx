import { resolveScaleAnchorLabels, SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES, type ScaleAnchorLanguage, type ScaleAnchorNumberSeparator, type ScaleAnchorVariant } from '../../utils/scaleAnchorLabels';

export interface ScaleAnchorLabelsProps {
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
    /**
     * One label per scale point. Supplied by sensory questions, where each of
     * the five answers has its own wording and the midpoint is the ideal.
     */
    pointLabels?: string[];
    /** Which point is the best answer. */
    idealPoint?: number | null;
    className?: string;
}

/**
 * Respondent-facing scale labels.
 *
 * Two layouts: when the question carries a label for every point, each point is
 * shown above the track with the ideal one marked. Otherwise it falls back to
 * the two/three anchor layout used by hedonic and bipolar scales.
 */
export default function ScaleAnchorLabels({
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
    className = '',
}: ScaleAnchorLabelsProps) {
    const { leftText, middleText, rightText, direction, points } = resolveScaleAnchorLabels({
        language,
        variant,
        scaleMin,
        scaleMax,
        minLabel,
        maxLabel,
        leftLabel,
        rightLabel,
        middleLabel,
        numberSeparator,
        pointLabels,
        idealPoint,
    });

    const isArabic = language === 'ar';
    const groupLabel = isArabic ? 'نطاق المقياس' : 'Scale range';

    if (points) {
        return (
            <div
                dir={direction}
                className={`flex items-start gap-1 px-1 ${className}`.trim()}
                role="group"
                aria-label={groupLabel}
            >
                {points.map((point) => (
                    <div
                        key={point.value}
                        className="flex-1 min-w-0 flex flex-col items-center gap-1 text-center"
                    >
                        <span
                            className={`inline-grid place-items-center w-6 h-6 rounded-full text-[11px] font-black shrink-0 ${
                                point.isIdeal
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                        >
                            {point.value}
                        </span>
                        <span
                            dir={isArabic ? 'rtl' : 'ltr'}
                            className={`${SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES} ${
                                point.isIdeal ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''
                            }`}
                        >
                            {point.text}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    const labelClass = `flex-1 ${SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES}`;

    return (
        <div
            dir={direction}
            className={`flex justify-between items-start gap-4 px-1 ${className}`.trim()}
            role="group"
            aria-label={groupLabel}
        >
            <span className={`${labelClass} text-start`}>{leftText}</span>
            {middleText && (
                <span className={`${labelClass} text-center`}>{middleText}</span>
            )}
            <span className={`${labelClass} text-end`}>{rightText}</span>
        </div>
    );
}
