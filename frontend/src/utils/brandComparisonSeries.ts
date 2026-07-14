/**
 * Shared brand-comparison chart series resolution for report UI + CSV export.
 *
 * Normalizes dataset label matching (PI vs likability) and PI value scaling so
 * alternate backend labels/units still render correctly.
 */

export type BrandComparisonSeriesRole = 'purchase_intent' | 'likability';

export interface BrandComparisonDatasetLike {
    label?: string;
    data?: unknown[];
    unit?: string;
}

export interface BrandComparisonMetadataLike {
    y_axis_left?: { label?: string; unit?: string };
    y_axis_right?: { label?: string; unit?: string; domain?: number[] };
    pi_diagnostics?: Record<string, unknown>;
}

export interface BrandComparisonChartDataLike {
    labels?: string[];
    datasets?: BrandComparisonDatasetLike[];
    metadata?: BrandComparisonMetadataLike;
    insight?: string;
}

export interface ResolvedBrandComparisonSeries {
    labels: string[];
    purchaseIntent: number[];
    likability: number[];
    purchaseIntentLabel: string;
    likabilityLabel: string;
    likabilityDomain: [number, number];
}

const PI_LABEL_RE =
    /(?:purchase\s*intent|intent\s*t2b|pi\s*t2b|likelihood\s+to\s+buy|conversion\s+potential|\bintent\b|\bpi\b)/i;

const LIKABILITY_LABEL_RE =
    /(?:overall\s*likability|likability|likeness|affinity|overall\s*liking|brand\s*affinity|sentiment)/i;

const LIKABILITY_UNIT_RE = /^(?:score|1-5|1-9|points?)$/i;

const normalizeText = (value: unknown): string =>
    String(value ?? '')
        .trim()
        .toLowerCase();

const roundDisplay = (value: number, digits = 1): number => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

/** Scale PI values to 0–100 display percent (matches PurchaseIntentChart rules). */
export const normalizePurchaseIntentPercent = (value: unknown, unit?: string): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;

    if (n >= 0 && n <= 1) return roundDisplay(n * 100, 1);

    const unitNorm = normalizeText(unit);
    if (unitNorm === '%' || (n > 1 && n <= 100)) return roundDisplay(n, 1);
    return roundDisplay(n, 1);
};

const metadataHintsRole = (
    metadata: BrandComparisonMetadataLike | undefined,
    role: BrandComparisonSeriesRole,
): boolean => {
    const axis = role === 'purchase_intent' ? metadata?.y_axis_left : metadata?.y_axis_right;
    const label = normalizeText(axis?.label);
    if (!label) return false;
    return role === 'purchase_intent' ? PI_LABEL_RE.test(label) : LIKABILITY_LABEL_RE.test(label);
};

export const classifyBrandComparisonDataset = (
    dataset: BrandComparisonDatasetLike,
    metadata?: BrandComparisonMetadataLike,
): BrandComparisonSeriesRole | null => {
    const label = normalizeText(dataset.label);
    const unit = normalizeText(dataset.unit);

    if (PI_LABEL_RE.test(label)) return 'purchase_intent';
    if (LIKABILITY_LABEL_RE.test(label)) return 'likability';

    if (unit === '%' && (metadataHintsRole(metadata, 'purchase_intent') || label.includes('t2b'))) {
        return 'purchase_intent';
    }
    if (LIKABILITY_UNIT_RE.test(unit) || unit === '1-5' || unit === '1-9') {
        return 'likability';
    }

    return null;
};

const scoreDatasetForRole = (
    dataset: BrandComparisonDatasetLike,
    role: BrandComparisonSeriesRole,
    metadata?: BrandComparisonMetadataLike,
): number => {
    const label = normalizeText(dataset.label);
    const unit = normalizeText(dataset.unit);
    let score = 0;

    if (role === 'purchase_intent') {
        if (/purchase\s*intent/.test(label)) score += 100;
        if (/intent\s*t2b|pi\s*t2b/.test(label)) score += 90;
        if (/\bintent\b/.test(label)) score += 70;
        if (/\bpi\b/.test(label)) score += 60;
        if (unit === '%') score += 40;
        if (metadataHintsRole(metadata, 'purchase_intent')) score += 20;
    } else {
        if (/overall\s*likability/.test(label)) score += 100;
        if (/likability|likeness/.test(label)) score += 90;
        if (/affinity|sentiment/.test(label)) score += 70;
        if (LIKABILITY_UNIT_RE.test(unit)) score += 50;
        if (metadataHintsRole(metadata, 'likability')) score += 20;
    }

    return score;
};

export const pickBrandComparisonDataset = (
    datasets: BrandComparisonDatasetLike[],
    role: BrandComparisonSeriesRole,
    metadata?: BrandComparisonMetadataLike,
    excludeIndexes: Set<number> = new Set(),
): { dataset: BrandComparisonDatasetLike; index: number } | null => {
    let best: { dataset: BrandComparisonDatasetLike; index: number; score: number } | null = null;

    datasets.forEach((dataset, index) => {
        if (excludeIndexes.has(index)) return;
        const classified = classifyBrandComparisonDataset(dataset, metadata);
        const score =
            classified === role
                ? scoreDatasetForRole(dataset, role, metadata)
                : classified === null
                  ? scoreDatasetForRole(dataset, role, metadata)
                  : -1;
        if (score <= 0) return;
        if (!best || score > best.score) {
            best = { dataset, index, score };
        }
    });

    if (best) {
        return { dataset: best.dataset, index: best.index };
    }

    // Fallback: two-series heuristic (first = PI, second = likability)
    if (datasets.length === 2) {
        const idx = role === 'purchase_intent' ? 0 : 1;
        if (!excludeIndexes.has(idx)) {
            return { dataset: datasets[idx], index: idx };
        }
    }

    return null;
};

export const resolveBrandComparisonSeries = (
    data: BrandComparisonChartDataLike | null | undefined,
): ResolvedBrandComparisonSeries => {
    const labels = Array.isArray(data?.labels) ? data!.labels!.map(String) : [];
    const datasets = Array.isArray(data?.datasets) ? data!.datasets! : [];
    const metadata = data?.metadata;

    const piPick = pickBrandComparisonDataset(datasets, 'purchase_intent', metadata);
    const olPick = pickBrandComparisonDataset(
        datasets,
        'likability',
        metadata,
        new Set(piPick ? [piPick.index] : []),
    );

    const piValues = Array.isArray(piPick?.dataset.data) ? piPick!.dataset.data! : [];
    const olValues = Array.isArray(olPick?.dataset.data) ? olPick!.dataset.data! : [];

    const likabilityDomain = metadata?.y_axis_right?.domain;
    const domain: [number, number] =
        Array.isArray(likabilityDomain) && likabilityDomain.length >= 2
            ? [Number(likabilityDomain[0]) || 0, Number(likabilityDomain[1]) || 5]
            : [1, 5];

    return {
        labels,
        purchaseIntent: labels.map((_, idx) =>
            normalizePurchaseIntentPercent(piValues[idx], piPick?.dataset.unit),
        ),
        likability: labels.map((_, idx) => {
            const n = Number(olValues[idx]);
            return Number.isFinite(n) ? roundDisplay(n, 2) : 0;
        }),
        purchaseIntentLabel: piPick?.dataset.label?.trim() || 'Purchase Intent (T2B%)',
        likabilityLabel: olPick?.dataset.label?.trim() || 'Overall Likability',
        likabilityDomain: domain,
    };
};

export const buildBrandComparisonChartRows = (
    data: BrandComparisonChartDataLike,
): Array<{ name: string; pi: number; ol: number }> => {
    const resolved = resolveBrandComparisonSeries(data);
    return resolved.labels.map((name, idx) => ({
        name,
        pi: resolved.purchaseIntent[idx] ?? 0,
        ol: resolved.likability[idx] ?? 0,
    }));
};
