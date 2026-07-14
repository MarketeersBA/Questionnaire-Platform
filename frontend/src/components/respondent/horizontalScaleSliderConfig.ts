import type { TrackPadding } from '../../utils/horizontalScaleMath';

export const SCALE_DRAG_HINT_STORAGE_KEY = 'scale_drag_hint_seen';

export type HorizontalScaleSliderSize = 'default' | 'large';

export interface HorizontalScaleSliderSizeTier {
    /** Outer interactive row */
    container: string;
    /** Horizontal padding on the outer row (Tailwind px-*) */
    rowPadding: string;
    /** Inset for the track rail inside the row (Tailwind inset-x-*) */
    trackInset: string;
    /** Pixel padding passed to the drag hook (must match trackInset) */
    trackPadding: TrackPadding;
    trackHeight: string;
    thumbSize: string;
    thumbHalfPx: number;
    thumbBorder: string;
    thumbRadius: string;
    thumbGrip: string;
    hitAreaHeight: string;
}

export const HORIZONTAL_SCALE_SLIDER_TIERS: Record<
    HorizontalScaleSliderSize,
    HorizontalScaleSliderSizeTier
> = {
    default: {
        container: 'relative h-16 flex items-center',
        rowPadding: 'px-2',
        trackInset: 'inset-x-2',
        trackPadding: { left: 8, right: 8 },
        trackHeight: 'h-4',
        thumbSize: 'w-12 h-12',
        thumbHalfPx: 24,
        thumbBorder: 'border-4',
        thumbRadius: 'rounded-xl',
        thumbGrip: 'w-1.5 h-5',
        hitAreaHeight: 'h-14',
    },
    large: {
        container: 'relative min-h-[4.5rem] flex items-center',
        rowPadding: 'px-4',
        trackInset: 'inset-x-4',
        trackPadding: { left: 16, right: 16 },
        trackHeight: 'h-6',
        thumbSize: 'w-16 h-16',
        thumbHalfPx: 32,
        thumbBorder: 'border-[6px]',
        thumbRadius: 'rounded-[1.25rem]',
        thumbGrip: 'w-2 h-7',
        hitAreaHeight: 'h-16',
    },
};

/** Responsive tier: large on mobile, default from md breakpoint upward. */
export const HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES = {
    container: 'relative min-h-[4.5rem] md:min-h-0 md:h-16 flex items-center',
    rowPadding: 'px-4 md:px-2',
    trackInset: 'inset-x-4 md:inset-x-2',
    trackHeight: 'h-6 md:h-4',
    thumbSize: 'w-16 h-16 md:w-12 md:h-12',
    thumbBorder: 'border-[6px] md:border-4',
    thumbRadius: 'rounded-[1.25rem] md:rounded-xl',
    thumbGrip: 'w-2 h-7 md:w-1.5 md:h-5',
    hitAreaHeight: 'h-16 md:h-14',
} as const;

export function resolveTrackPaddingForSize(
    size: HorizontalScaleSliderSize,
    isMdUp: boolean,
): TrackPadding {
    if (size === 'default') {
        return HORIZONTAL_SCALE_SLIDER_TIERS.default.trackPadding;
    }

    if (isMdUp) {
        return HORIZONTAL_SCALE_SLIDER_TIERS.default.trackPadding;
    }

    return HORIZONTAL_SCALE_SLIDER_TIERS.large.trackPadding;
}

export function getScaleDragHintText(language: 'en' | 'ar'): string {
    return language === 'ar'
        ? 'اسحب المؤشر أو المس الشريط'
        : 'Drag the handle or tap the bar';
}

export function readScaleDragHintDismissed(): boolean {
    try {
        return sessionStorage.getItem(SCALE_DRAG_HINT_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function persistScaleDragHintDismissed(): void {
    try {
        sessionStorage.setItem(SCALE_DRAG_HINT_STORAGE_KEY, '1');
    } catch {
        // sessionStorage may be unavailable in private mode — ignore.
    }
}
