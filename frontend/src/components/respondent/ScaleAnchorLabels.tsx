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
    numberSeparator?: ScaleAnchorNumberSeparator;
    className?: string;
}

/**
 * Respondent-facing scale/domain anchor labels (e.g. حلو / وحش).
 * Shared by taste-test and product-test renderers.
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
    numberSeparator = 'dot',
    className = '',
}: ScaleAnchorLabelsProps) {
    const { leftText, rightText, direction } = resolveScaleAnchorLabels({
        language,
        variant,
        scaleMin,
        scaleMax,
        minLabel,
        maxLabel,
        leftLabel,
        rightLabel,
        numberSeparator,
    });

    const isArabic = language === 'ar';
    const labelClass = `flex-1 ${SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES}`;

    return (
        <div
            dir={direction}
            className={`flex justify-between items-start gap-4 px-1 ${className}`.trim()}
            role="group"
            aria-label={isArabic ? 'نطاق المقياس' : 'Scale range'}
        >
            <span className={`${labelClass} text-start`}>{leftText}</span>
            <span className={`${labelClass} text-end`}>{rightText}</span>
        </div>
    );
}
