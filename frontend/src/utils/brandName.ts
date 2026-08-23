/**
 * Display formatting for brand names.
 *
 * Survey configs often append the respondent-facing marker shape to the brand
 * name, e.g. `هيرو (مثلث)` / `ابو عوف (مربع)` — "Hero (triangle)", "Abu Aouf
 * (square)". That annotation exists so respondents can match a sample to a
 * label during fieldwork; inside the report the shape is already carried by the
 * chart legend, so repeating it in every heading is noise.
 *
 * Only known shape words are stripped. A parenthetical that carries real
 * meaning — `(Legacy)`, `(2024)`, `(Reformulated)` — is left untouched.
 */

/** Marker-shape words, Arabic and English, that appear as brand suffixes. */
const SHAPE_TOKENS = [
    // Arabic
    'مربع', 'مثلث', 'دائرة', 'دائره', 'معين', 'نجمة', 'نجمه', 'مستطيل', 'قلب',
    // English
    'square', 'triangle', 'circle', 'diamond', 'star', 'rectangle', 'heart',
    'cross', 'oval', 'hexagon',
];

const NORMALISED_SHAPES = new Set(SHAPE_TOKENS.map((t) => t.toLowerCase()));

/**
 * Strip a trailing marker-shape parenthetical from a brand name.
 *
 * `"هيرو (مثلث)"` -> `"هيرو"`;  `"Hero (Legacy)"` -> unchanged.
 */
export function formatBrandName(raw: unknown): string {
    const text = String(raw ?? '').trim();
    if (!text) return '';

    // Match a parenthetical at the very end, in either bracket style.
    const match = text.match(/^(.*?)[\s]*[（(]\s*([^）)]*)\s*[）)]\s*$/);
    if (!match) return text;

    const [, head, inner] = match;
    const token = inner.trim().toLowerCase();
    if (!token) return text;

    // Strip only when every word inside the parenthetical is a shape word.
    const words = token.split(/[\s/,،-]+/).filter(Boolean);
    const allShapes = words.length > 0 && words.every((w) => NORMALISED_SHAPES.has(w));

    return allShapes ? head.trim() || text : text;
}

/** Apply {@link formatBrandName} across a list, preserving order. */
export function formatBrandNames(values: unknown[]): string[] {
    return (values || []).map(formatBrandName);
}
