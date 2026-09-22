import {
    buildScaleRangeAriaLabel,
    type ScaleAnchorLanguage,
    type ScaleAnchorNumberSeparator,
    type ScaleAnchorVariant,
} from '../../utils/scaleAnchorLabels';
import ScaleAnchorLabels from './ScaleAnchorLabels';
import type { HorizontalScaleSliderSize } from './horizontalScaleSliderConfig';

export interface HorizontalScaleSliderProps {
    value: number | null | undefined;
    min?: number;
    max: number;
    onChange: (value: number) => void;
    language: ScaleAnchorLanguage;
    variant?: ScaleAnchorVariant;
    minLabel?: string;
    maxLabel?: string;
    /** One label per scale point; renders a labelled point row instead of anchors. */
    pointLabels?: string[];
    /** Which point is the best answer (midpoint on a centered scale). */
    idealPoint?: number | null;
    numberSeparator?: ScaleAnchorNumberSeparator;
    /** Kept for call-site compatibility; larger tap targets when `large`. */
    size?: HorizontalScaleSliderSize;
    showValueBadge?: boolean;
    pulseError?: boolean;
    className?: string;
}

/**
 * Respondent-facing scale control as numbered tap buttons.
 * Replaces the drag slider, which was unreliable on touch devices.
 */
export default function HorizontalScaleSlider({
    value,
    min = 1,
    max,
    onChange,
    language,
    variant = 'linear',
    minLabel,
    maxLabel,
    pointLabels,
    idealPoint = null,
    numberSeparator = 'dot',
    size = 'default',
    pulseError = false,
    className = '',
}: HorizontalScaleSliderProps) {
    const steps: number[] = [];
    for (let step = min; step <= max; step += 1) {
        steps.push(step);
    }

    const selected =
        typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
            ? value
            : null;

    const ariaLabel = buildScaleRangeAriaLabel({
        language,
        scaleMax: max,
        minLabel,
        maxLabel,
    });

    const isLarge = size === 'large';
    // Height only. Width comes from the grid track below, so the row always
    // holds every point: a fixed min-width made ten 44px buttons overflow the
    // card and wrap, dropping "10" onto its own line under the others — which
    // reads as a separate option rather than the top of the scale.
    const buttonSizeClass = isLarge
        ? 'h-11 md:h-12 text-sm md:text-base'
        : 'h-10 text-sm';

    return (
        <div
            className={`space-y-3 ${pulseError ? 'rounded-2xl ring-2 ring-rose-400/80 p-2' : ''} ${className}`.trim()}
            role="group"
            aria-label={ariaLabel}
        >
            {/* One equal-width column per point. The buttons shrink to fit
                rather than wrapping; below ~2rem a point the row scrolls
                horizontally instead of becoming untappable. */}
            <div
                dir="ltr"
                className="grid gap-1.5 sm:gap-2 overflow-x-auto pb-1"
                style={{
                    gridTemplateColumns: `repeat(${steps.length}, minmax(2rem, 1fr))`,
                }}
            >
                {steps.map((step) => {
                    const isSelected = selected === step;
                    return (
                        <button
                            key={step}
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={`${step}`}
                            onClick={() => onChange(step)}
                            className={`${buttonSizeClass} w-full px-0 rounded-xl border font-black transition-all ${
                                isSelected
                                    ? 'bg-primary text-white border-primary scale-105 shadow-md'
                                    : 'bg-surface-raised border-slate-200 text-slate-500 hover:border-primary/40 hover:text-ink dark:border-slate-700'
                            }`}
                        >
                            {step}
                        </button>
                    );
                })}
            </div>

            <ScaleAnchorLabels
                language={language}
                variant={variant}
                scaleMin={min}
                scaleMax={max}
                minLabel={minLabel}
                maxLabel={maxLabel}
                pointLabels={pointLabels}
                idealPoint={idealPoint}
                numberSeparator={numberSeparator}
            />

            <p className="text-[11px] text-ink-subtle text-center font-medium">
                {language === 'ar' ? 'اضغط على رقم للاختيار' : 'Tap a number to select'}
            </p>
        </div>
    );
}
