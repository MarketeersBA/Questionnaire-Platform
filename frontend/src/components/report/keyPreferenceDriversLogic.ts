/**
 * Pure data logic for the Key Preference Drivers chart.
 *
 * Kept apart from the component so the parts that decide *what the chart shows*
 * — key matching across report vintages, sub-attribute counting, grouping —
 * can be tested without mounting Recharts.
 */

/** Attributes that represent the dependent variable itself, not a driver. */
const OVERALL_MARKERS = ['general', 'overall', 'likeness', 'total', 'global', 'essence'];

export const isOverallAttr = (name: string): boolean => {
    const lower = String(name || '').toLowerCase().trim();
    return OVERALL_MARKERS.some((m) => lower.includes(m));
};

/** Canonical join key — mirrors `_norm_attr_key` in the Python aggregator. */
export const normKey = (label: string): string =>
    String(label || '')
        .toLowerCase()
        .trim()
        .replace(/[\s_\-/]+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();

/**
 * Backend emits importance as `correlation * 100`. Convert unconditionally —
 * the old `x > 1 ? x / 100 : x` guard mis-scaled any attribute whose
 * correlation happened to land at exactly 0.01.
 */
export const toImportance = (x: number): number => (Number(x) || 0) / 100;

/**
 * Match a main-scatter attribute key against the keys present in the
 * sub-scatter.
 *
 * Reports generated before the aggregator sourced both panels from the same
 * dataframe column carry two different vocabularies: the main panel is keyed
 * off `flat_evaluations.attribute` while the sub panel is keyed off the
 * registry's `main_att`. Exact match is tried first; failing that, a
 * containment match recovers the common cases ("Taste" vs "Taste Quality") so
 * historical reports still drill down instead of showing an empty panel.
 */
export function resolveMainKey(key: string, available: Set<string>): string | null {
    if (!key) return null;
    if (available.has(key)) return key;

    const candidates = Array.from(available).filter(
        (k) => k.includes(key) || key.includes(k),
    );
    if (!candidates.length) return null;

    candidates.sort(
        (a, b) => Math.abs(a.length - key.length) - Math.abs(b.length - key.length),
    );
    return candidates[0];
}

/**
 * Sub-attribute count per main attribute.
 *
 * Prefers the backend's `attribute_hierarchy`. Reports generated before that
 * field existed are rebuilt from the sub-scatter points, counting each DISTINCT
 * sub-attribute name rather than each brand's copy of it.
 */
export function countSubAttributes(data: any): Map<string, number> {
    const map = new Map<string, number>();

    (data?.attribute_hierarchy || []).forEach((node: any) => {
        const key = node?.main_key || normKey(node?.main_attribute || '');
        if (key) map.set(key, (node?.sub_attributes || []).length);
    });
    if (map.size) return map;

    const seen = new Map<string, Set<string>>();
    (data?.sub_scatter?.datasets || []).forEach((ds: any) =>
        (ds?.data || []).forEach((pt: any) => {
            const mainKey = pt?.main_key || normKey(pt?.main_attribute || '');
            const subKey = pt?.sub_key || normKey(pt?.sub_attribute || '');
            if (!mainKey || !subKey) return;
            // `is_distinct` only exists on newer payloads; older ones are
            // filtered by comparing the two keys directly.
            const distinct = pt.is_distinct ?? (mainKey !== subKey);
            if (!distinct) return;
            if (!seen.has(mainKey)) seen.set(mainKey, new Set());
            seen.get(mainKey)!.add(subKey);
        }),
    );
    seen.forEach((subs, key) => map.set(key, subs.size));
    return map;
}

/** Every main-attribute key that actually appears in the sub-scatter. */
export function collectSubScatterMainKeys(data: any): Set<string> {
    const keys = new Set<string>();
    (data?.sub_scatter?.datasets || []).forEach((ds: any) =>
        (ds?.data || []).forEach((pt: any) => {
            const k = pt?.main_key || normKey(pt?.main_attribute || '');
            if (k) keys.add(k);
        }),
    );
    return keys;
}

export interface BrandMark {
    brand: string;
    brandIndex: number;
    y: number;
}

export interface AttrGroup {
    key: string;
    label: string;
    x: number;
    marks: BrandMark[];
    minY: number;
    maxY: number;
    subCount: number;
}

/**
 * Collapse per-brand scatter points into one box per attribute, spanning the
 * evaluation range of every brand at that attribute's importance.
 */
export function buildGroups(
    datasets: any[],
    brandOrder: string[],
    opts: {
        filter?: (pt: any) => boolean;
        labelOf: (pt: any) => string;
        keyOf: (pt: any) => string;
        subCountOf?: (key: string) => number;
    },
): AttrGroup[] {
    const groups = new Map<string, AttrGroup>();

    (datasets || []).forEach((ds: any) => {
        const brand = ds?.brand || '';
        const brandIndex = Math.max(0, brandOrder.indexOf(brand));

        (ds?.data || []).forEach((pt: any) => {
            if (typeof pt?.x !== 'number' || typeof pt?.y !== 'number') return;
            if (opts.filter && !opts.filter(pt)) return;

            const label = opts.labelOf(pt);
            if (!label || isOverallAttr(label)) return;

            const key = opts.keyOf(pt) || normKey(label);
            const x = toImportance(pt.x);

            let g = groups.get(key);
            if (!g) {
                g = {
                    key, label, x,
                    marks: [],
                    minY: pt.y,
                    maxY: pt.y,
                    subCount: opts.subCountOf ? opts.subCountOf(key) : 0,
                };
                groups.set(key, g);
            }
            g.marks.push({ brand, brandIndex, y: pt.y });
            g.minY = Math.min(g.minY, pt.y);
            g.maxY = Math.max(g.maxY, pt.y);
        });
    });

    return Array.from(groups.values()).sort((a, b) => b.x - a.x);
}

/** Padded axis domain with a sane fallback for degenerate (single-point) data. */
export function padDomain(
    values: number[],
    pad: number,
    floorAtZero = false,
): [number, number] {
    if (!values.length) return [0, 1];
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= pad || 1; max += pad || 1; }
    const span = max - min;
    let lo = min - span * pad;
    const hi = max + span * pad;
    if (floorAtZero) lo = Math.max(0, lo);
    return [lo, hi];
}
