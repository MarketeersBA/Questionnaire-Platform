/**
 * Marketeers brand palette — single source of truth for chart colour.
 *
 * Report charts previously each carried their own copy-pasted array of generic
 * Tailwind hexes (`#3b82f6`, `#06b6d4`, `#ef4444`, …), which is why the reports
 * never looked like the brand. Everything visual should now come from here so a
 * palette change lands across every current and future report at once.
 *
 * The two anchor colours are taken from the Marketeers logo:
 *   - Lapis Blue  #255E91  — the "M"
 *   - Brand Red   #CD393B  — the triangle
 */

/* ── Logo anchors ───────────────────────────────────────────────────────── */
export const BRAND = {
    blue: '#255E91',
    red: '#CD393B',
    navy: '#0B1E3D',
    navyLight: '#12294D',
    navyDeep: '#071527',
    cyan: '#8ACAEC',
    chartBlue: '#21A0FF',
    yellow: '#FBC210',
    safe: '#2e7d32',
    warning: '#f58327',
} as const;

/**
 * Categorical series palette.
 *
 * Ordered so the two logo colours lead — the first two series in any chart are
 * the brand's blue and red. Later entries stay tonally adjacent (blues, then
 * supporting warm/green accents) so a 6-brand chart still reads as one system.
 * Hues are spaced enough to remain distinguishable for the most common forms of
 * colour-vision deficiency, and each has a light/dark variant tuned for
 * contrast against the respective page background.
 */
export interface SeriesColor {
    /** Primary fill, tuned for light backgrounds. */
    light: string;
    /** Primary fill, lifted for dark backgrounds. */
    dark: string;
    /** Distinct scatter marker shape, mirroring the legacy PPTX decks. */
    shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'cross';
    name: string;
}

export const SERIES: SeriesColor[] = [
    { light: '#255E91', dark: '#4E9BD6', shape: 'circle', name: 'Lapis Blue' },
    { light: '#CD393B', dark: '#F06E70', shape: 'square', name: 'Brand Red' },
    { light: '#2E7D32', dark: '#5CBF62', shape: 'triangle', name: 'Green' },
    { light: '#B8860B', dark: '#FBC210', shape: 'diamond', name: 'Gold' },
    { light: '#6D28D9', dark: '#A78BFA', shape: 'star', name: 'Violet' },
    { light: '#0E7490', dark: '#5CC9E0', shape: 'cross', name: 'Teal' },
];

/**
 * Theme-agnostic series palette.
 *
 * Many charts declare their colour array at module scope, where the current
 * theme is not known. These are mid-tone versions of the same hues, chosen to
 * hold contrast on both the white and the near-black canvas, so those charts
 * can stay on-brand without being rewritten to read the theme. Prefer
 * `seriesColor(i, isDark)` in components that already know the theme.
 */
export const CHART_SERIES: string[] = [
    '#2E7BB8', // Lapis blue, lifted
    '#E04B4D', // Brand red, lifted
    '#3D9E44', // Green
    '#E0A81E', // Gold
    '#8B5CF6', // Violet
    '#1AA5C4', // Teal
];

/** Series fill for index `i` in the given theme. Wraps past the palette end. */
export function seriesColor(i: number, isDark: boolean): string {
    const entry = SERIES[i % SERIES.length];
    return isDark ? entry.dark : entry.light;
}

/** Marker shape for index `i`. */
export function seriesShape(i: number): SeriesColor['shape'] {
    return SERIES[i % SERIES.length].shape;
}

/** Full ordered list of fills for a theme — for charts that want an array. */
export function seriesPalette(isDark: boolean): string[] {
    return SERIES.map((s) => (isDark ? s.dark : s.light));
}

/**
 * Rank-based emphasis used by ranked bar charts: leaders in brand blue,
 * laggards in brand red, the middle band muted so the extremes carry meaning.
 */
export function rankColor(index: number, total: number, isDark: boolean): string {
    const topCount = Math.min(3, Math.ceil(total / 3));
    if (index < topCount) return isDark ? '#4E9BD6' : BRAND.blue;
    if (total > 6 && index >= total - topCount) return isDark ? '#F06E70' : BRAND.red;
    return isDark ? '#3E5C7E' : BRAND.cyan;
}

/* ── Chart chrome ───────────────────────────────────────────────────────── */

/** Axis/grid/label colours so every chart's furniture matches. */
export function chartChrome(isDark: boolean) {
    return {
        axis: isDark ? '#7C8CA5' : '#64748b',
        grid: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.08)',
        label: isDark ? '#94a3b8' : '#334155',
        refLine: isDark ? '#3E4C63' : '#cbd5e1',
        quadrantFill: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.025)',
        tooltipBg: isDark ? '#0B1220' : '#FFFFFF',
        tooltipBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
    };
}
