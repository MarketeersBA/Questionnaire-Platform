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
        container: 'relative h-11 flex items-center',
        rowPadding: 'px-1.5',
        trackInset: 'inset-x-1.5',
        trackPadding: { left: 8, right: 8 },
        trackHeight: 'h-2.5',
        thumbSize: 'w-9 h-9',
        thumbHalfPx: 18,
        thumbBorder: 'border-[3px]',
        thumbRadius: 'rounded-lg',
        thumbGrip: 'w-1 h-3.5',
        hitAreaHeight: 'h-11',
    },
    large: {
        container: 'relative min-h-[3.25rem] flex items-center',
        rowPadding: 'px-3',
        trackInset: 'inset-x-3',
        trackPadding: { left: 16, right: 16 },
        trackHeight: 'h-3',
        thumbSize: 'w-11 h-11',
        thumbHalfPx: 22,
        thumbBorder: 'border-4',
        thumbRadius: 'rounded-xl',
        thumbGrip: 'w-1.5 h-4',
        hitAreaHeight: 'h-12',
    },
};

/** Responsive tier: large on mobile, default from md breakpoint upward. */
export const HORIZONTAL_SCALE_SLIDER_RESPONSIVE_CLASSES = {
    container: 'relative min-h-[3.25rem] md:min-h-0 md:h-11 flex items-center',
    rowPadding: 'px-3 md:px-1.5',
    trackInset: 'inset-x-3 md:inset-x-1.5',
    trackHeight: 'h-3 md:h-2.5',
    thumbSize: 'w-11 h-11 md:w-9 md:h-9',
    thumbBorder: 'border-4 md:border-[3px]',
    thumbRadius: 'rounded-xl md:rounded-lg',
    thumbGrip: 'w-1.5 h-4 md:w-1 md:h-3.5',
    hitAreaHeight: 'h-12 md:h-11',
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

// export function getScaleDragHintText(language: 'en' | 'ar'): string {
//     return language === 'ar'
//         ? 'اسحب المؤشر أو المس الشريط'
//         : 'Drag the handle or tap the bar';
// }

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
