/**
 * Pure coordinate math for horizontal scale sliders.
 * Framework-agnostic — safe to use in hooks, components, and unit tests.
 *
 * Track geometry is always LTR (min = left, max = right) regardless of page
 * language; RTL applies only to label text via ScaleAnchorLabels.
 */

/** Minimal geometry needed for pointer → value mapping. */
export interface TrackGeometry {
    left: number;
    width: number;
}

/** Inclusive integer scale bounds. */
export interface ScaleRange {
    min: number;
    max: number;
}

/** Horizontal inset inside the track container (matches Tailwind inset-x-*). */
export interface TrackPadding {
    left: number;
    right: number;
}

export interface ClientXToScaleValueOptions {
    clientX: number;
    trackRect: DOMRect | TrackGeometry;
    range: ScaleRange;
    padding?: TrackPadding;
}

const DEFAULT_PADDING: TrackPadding = { left: 0, right: 0 };

/** Read width/left from DOMRect or a plain geometry object. */
export function toTrackGeometry(rect: DOMRect | TrackGeometry): TrackGeometry {
    return {
        left: rect.left,
        width: rect.width,
    };
}

/**
 * Apply horizontal padding to the raw container rect, yielding the interactive track span.
 */
export function resolveTrackGeometry(
    trackRect: DOMRect | TrackGeometry,
    padding: TrackPadding = DEFAULT_PADDING,
): TrackGeometry {
    const base = toTrackGeometry(trackRect);
    const insetLeft = Math.max(0, padding.left);
    const insetRight = Math.max(0, padding.right);
    const width = Math.max(0, base.width - insetLeft - insetRight);

    return {
        left: base.left + insetLeft,
        width,
    };
}

/**
 * Map clientX to a clamped 0–1 position along the interactive track.
 * Returns 0 when clientX is at or left of the track start; 1 at or past the end.
 */
export function clientXToNormalizedPosition(
    clientX: number,
    geometry: TrackGeometry,
): number {
    if (geometry.width <= 0) {
        return 0;
    }

    const raw = (clientX - geometry.left) / geometry.width;
    return Math.min(1, Math.max(0, raw));
}

/**
 * Convert a normalized 0–1 position to a snapped integer in [min, max].
 */
export function normalizedPositionToScaleValue(
    normalized: number,
    range: ScaleRange,
): number {
    const { min, max } = range;

    if (max <= min) {
        return min;
    }

    const continuous = min + normalized * (max - min);
    return Math.min(max, Math.max(min, Math.round(continuous)));
}

/**
 * Map a viewport X coordinate to a snapped scale value.
 */
export function clientXToScaleValue(options: ClientXToScaleValueOptions): number {
    const geometry = resolveTrackGeometry(options.trackRect, options.padding);
    const normalized = clientXToNormalizedPosition(options.clientX, geometry);
    return normalizedPositionToScaleValue(normalized, options.range);
}

/**
 * Continuous 0–1 position for a scale value (inverse of snapping).
 */
export function scaleValueToNormalized(value: number, range: ScaleRange): number {
    const { min, max } = range;

    if (max <= min) {
        return 0;
    }

    const clamped = Math.min(max, Math.max(min, value));
    return (clamped - min) / (max - min);
}

/**
 * Percentage along the track for thumb / fill positioning (0–100).
 * Pair with CSS: left: calc(${percent}% - ${halfThumbPx}px)
 */
export function scaleValueToPercent(value: number, range: ScaleRange): number {
    return scaleValueToNormalized(value, range) * 100;
}

/**
 * Safe getBoundingClientRect wrapper — returns null when the ref is unset.
 */
export function getTrackRect(ref: { current: HTMLElement | null }): DOMRect | null {
    return ref.current?.getBoundingClientRect() ?? null;
}

/**
 * Resolve clientX → value when a live DOM ref is available.
 * Returns null when the track element is not mounted.
 */
export function clientXToScaleValueFromRef(
    clientX: number,
    trackRef: { current: HTMLElement | null },
    range: ScaleRange,
    padding?: TrackPadding,
): number | null {
    const rect = getTrackRect(trackRef);
    if (!rect) {
        return null;
    }

    return clientXToScaleValue({
        clientX,
        trackRect: rect,
        range,
        padding,
    });
}
