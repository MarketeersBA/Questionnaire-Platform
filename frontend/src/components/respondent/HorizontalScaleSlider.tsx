import { motion, useReducedMotion } from 'framer-motion';
import {
    useEffect,
    useRef,
    useState,
} from 'react';
import { useHorizontalScaleDrag } from '../../hooks/useHorizontalScaleDrag';
import {
    buildScaleRangeAriaLabel,
    buildScaleRangeAriaValueText,
    type ScaleAnchorLanguage,
    type ScaleAnchorNumberSeparator,
} from '../../utils/scaleAnchorLabels';
import { scaleValueToPercent, type ScaleRange } from '../../utils/horizontalScaleMath';
import ScaleAnchorLabels from './ScaleAnchorLabels';
import {
    HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES,
    HORIZONTAL_SCALE_SLIDER_TIERS,
    resolveTrackPaddingForSize,
    type HorizontalScaleSliderSize,
} from './horizontalScaleSliderConfig';

export interface HorizontalScaleSliderProps {
    value: number;
    min?: number;
    max: number;
    onChange: (value: number) => void;
    language: ScaleAnchorLanguage;
    minLabel?: string;
    maxLabel?: string;
    numberSeparator?: ScaleAnchorNumberSeparator;
    /** `large` uses mobile-optimized sizing; from `md:` falls back to default dimensions. */
    size?: HorizontalScaleSliderSize;
    showValueBadge?: boolean;
    pulseError?: boolean;
    className?: string;
}

interface ResolvedVisualTier {
    container: string;
    rowPadding: string;
    trackInset: string;
    trackHeight: string;
    thumbSize: string;
    thumbHalfPx: number;
    thumbBorder: string;
    thumbRadius: string;
    thumbGrip: string;
    hitAreaHeight: string;
}

function useMdBreakpoint(): boolean {
    const [isMdUp, setIsMdUp] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        return window.matchMedia('(min-width: 768px)').matches;
    });

    useEffect(() => {
        const media = window.matchMedia('(min-width: 768px)');
        const onChange = (event: MediaQueryListEvent) => setIsMdUp(event.matches);

        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);

    return isMdUp;
}

function resolveVisualTier(size: HorizontalScaleSliderSize, isMdUp: boolean): ResolvedVisualTier {
    if (size === 'large' && !isMdUp) {
        return HORIZONTAL_SCALE_SLIDER_TIERS.large;
    }

    if (size === 'large' && isMdUp) {
        return HORIZONTAL_SCALE_SLIDER_TIERS.default;
    }

    return HORIZONTAL_SCALE_SLIDER_TIERS.default;
}

interface ScaleTickMarksProps {
    range: ScaleRange;
    trackInset: string;
}

function ScaleTickMarks({ range, trackInset }: ScaleTickMarksProps) {
    const steps: number[] = [];
    for (let step = range.min; step <= range.max; step += 1) {
        steps.push(step);
    }

    return (
        <div
            className={`pointer-events-none absolute ${trackInset} inset-y-0 z-10`}
            aria-hidden="true"
        >
            {steps.map((step) => {
                const percent = scaleValueToPercent(step, range);
                return (
                    <span
                        key={step}
                        className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300/80 dark:bg-slate-600/80"
                        style={{ left: `${percent}%` }}
                    />
                );
            })}
        </div>
    );
}

interface ScaleValueBadgeProps {
    value: number;
    percent: number;
    visible: boolean;
}

function ScaleValueBadge({ value, percent, visible }: ScaleValueBadgeProps) {
    if (!visible) {
        return null;
    }

    return (
        <motion.div
            role="presentation"
            className="pointer-events-none absolute z-40 -translate-x-1/2 rounded-lg bg-primary px-2 py-0.5 text-xs font-black text-white shadow-md"
            style={{ left: `${percent}%`, top: '-0.25rem' }}
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: -28, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
        >
            {value}
        </motion.div>
    );
}

/**
 * Respondent-facing horizontal scale slider with hold-and-drag thumb,
 * tap-to-jump track, tick marks, and full keyboard / screen-reader support.
 */
export default function HorizontalScaleSlider({
    value,
    min = 1,
    max,
    onChange,
    language,
    minLabel,
    maxLabel,
    numberSeparator = 'dot',
    size = 'default',
    showValueBadge = true,
    pulseError = false,
    className = '',
}: HorizontalScaleSliderProps) {
    const isScaleDragEnabled = import.meta.env.VITE_ENABLE_SCALE_DRAG !== 'false';
    const range: ScaleRange = { min, max };
    const isMdUp = useMdBreakpoint();
    const prefersReducedMotion = useReducedMotion();
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const rangeInputRef = useRef<HTMLInputElement>(null);

    const visualTier = resolveVisualTier(size, isMdUp);
    const trackPadding = resolveTrackPaddingForSize(size, isMdUp);
    const useResponsiveClasses = size === 'large';

    const { isDragging, dragValue, trackHandlers, thumbHandlers, touchActionStyle } =
        useHorizontalScaleDrag({
            value,
            min,
            max,
            onChange,
            trackRef,
            thumbRef,
            trackPadding,
            enabled: isScaleDragEnabled,
        });

    const displayValue = isDragging ? dragValue : value;
    const fillPercent = scaleValueToPercent(displayValue, range);
    const thumbHalfPx = useResponsiveClasses
        ? size === 'large' && !isMdUp
            ? 22
            : 18
        : visualTier.thumbHalfPx;

    const ariaLabel = buildScaleRangeAriaLabel({
        language,
        scaleMax: max,
        minLabel,
        maxLabel,
    });

    const ariaValueText = buildScaleRangeAriaValueText(displayValue, max, language);

    const containerClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.container
        : visualTier.container;
    const rowPaddingClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.rowPadding
        : visualTier.rowPadding;
    const trackInsetClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.trackInset
        : visualTier.trackInset;
    const trackHeightClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.trackHeight
        : visualTier.trackHeight;
    const thumbSizeClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.thumbSize
        : visualTier.thumbSize;
    const thumbBorderClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.thumbBorder
        : visualTier.thumbBorder;
    const thumbRadiusClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.thumbRadius
        : visualTier.thumbRadius;
    const thumbGripClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.thumbGrip
        : visualTier.thumbGrip;
    const hitAreaHeightClass = useResponsiveClasses
        ? HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES.hitAreaHeight
        : visualTier.hitAreaHeight;

    // Instant tracking while dragging avoids spring lag; springs only on settle.
    const motionTransition =
        prefersReducedMotion || isDragging
            ? { duration: 0 }
            : { type: 'spring' as const, stiffness: 400, damping: 32 };

    return (
        <div className={`space-y-2 ${pulseError ? 'rounded-2xl ring-2 ring-rose-400/80 p-2' : ''} ${className}`.trim()}>
            <div
                className={`${containerClass} ${rowPaddingClass} overflow-visible focus-within:outline-none`}
            >
                <ScaleValueBadge
                    value={displayValue}
                    percent={fillPercent}
                    visible={showValueBadge && isDragging}
                />

                <div
                    ref={trackRef}
                    className={`relative w-full ${hitAreaHeightClass} select-none`}
                    style={touchActionStyle}
                    {...trackHandlers}
                >
                    <div
                        className={`absolute ${trackInsetClass} top-1/2 -translate-y-1/2 ${trackHeightClass} overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner transition-colors dark:border-slate-800 dark:bg-slate-800/50`}
                    >
                        <motion.div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-brand-accent to-brand-cyan shadow-[0_0_15px_rgba(37,94,145,0.3)]"
                            initial={false}
                            animate={{ width: `${fillPercent}%` }}
                            transition={motionTransition}
                        />

                        <ScaleTickMarks range={range} trackInset="inset-x-0" />
                    </div>

                    <input
                        ref={rangeInputRef}
                        type="range"
                        min={min}
                        max={max}
                        step={1}
                        value={displayValue}
                        aria-label={ariaLabel}
                        aria-valuetext={ariaValueText}
                        onChange={(event) => onChange(parseInt(event.target.value, 10))}
                        className={`absolute inset-x-0 top-1/2 z-30 w-full -translate-y-1/2 opacity-0 ${hitAreaHeightClass} cursor-pointer focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:ring-4 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900`}
                    />

                    <motion.div
                        ref={thumbRef}
                        role="slider"
                        aria-label={ariaLabel}
                        aria-valuemin={min}
                        aria-valuemax={max}
                        aria-valuenow={displayValue}
                        aria-valuetext={ariaValueText}
                        tabIndex={-1}
                        className={`absolute top-1/2 z-20 flex cursor-grab items-center justify-center bg-white active:cursor-grabbing dark:bg-slate-900 ${thumbSizeClass} ${thumbBorderClass} ${thumbRadiusClass} border-primary shadow-lg transition-shadow ${isDragging ? 'shadow-[0_12px_28px_-8px_rgba(37,94,145,0.45)]' : ''}`}
                        animate={{
                            left: `calc(${fillPercent}% - ${thumbHalfPx}px)`,
                            y: '-50%',
                            scale: prefersReducedMotion ? 1 : (isDragging ? 1.08 : 1),
                        }}
                        transition={
                            prefersReducedMotion || isDragging
                                ? { duration: 0 }
                                : { type: 'spring', stiffness: 400, damping: 28 }
                        }
                        {...thumbHandlers}
                    >
                        <div className={`rounded-full bg-primary/10 ${thumbGripClass}`} />
                    </motion.div>
                </div>
            </div>

            <ScaleAnchorLabels
                language={language}
                variant="linear"
                scaleMin={min}
                scaleMax={max}
                minLabel={minLabel}
                maxLabel={maxLabel}
                numberSeparator={numberSeparator}
            />

            <p className="text-[11px] text-ink-subtle text-center font-medium">
                {language === 'ar' ? 'اسحب المؤشر أو اضغط على الشريط' : 'Drag the handle or tap the bar'}
            </p>
        </div>
    );
}
