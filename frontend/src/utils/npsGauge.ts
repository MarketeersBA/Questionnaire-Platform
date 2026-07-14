/**
 * NPS gauge chart payload normalization for web report rendering.
 *
 * Accepts canonical multi-brand payloads from ``ReportAggregator.nps_recommend``,
 * legacy transposed segment-row shapes, and single-brand flat envelopes.
 */

import { formatSignedNps } from './scorecardProfile';

export const NPS_SEGMENT_LABELS = new Set([
    'Promoters_Pct',
    'Passives_Pct',
    'Detractors_Pct',
    'Promoters',
    'Passives',
    'Detractors',
]);

export const NPS_SEGMENT_ORDER = ['Detractors', 'Passives', 'Promoters'] as const;

export type NpsSegmentKey = (typeof NPS_SEGMENT_ORDER)[number];

export const NPS_SEGMENT_COLORS: Record<NpsSegmentKey, string> = {
    Detractors: '#ef4444',
    Passives: '#94a3b8',
    Promoters: '#10b981',
};

export type NpsBrandRow = {
    brand: string;
    detractors: number;
    passives: number;
    promoters: number;
    nps: number | null;
};

export type NpsScoreTone = 'strong' | 'neutral' | 'negative' | 'unknown';

type DatasetLike = { label?: unknown; data?: unknown[] };
type SegmentLike = { brand?: unknown; nps?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asDatasets = (value: unknown): DatasetLike[] =>
    Array.isArray(value) ? value.filter((item): item is DatasetLike => isRecord(item)) : [];

const asLabels = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((label) => String(label ?? '')) : [];

const normalizeSegmentLabel = (label: unknown): string => String(label ?? '').trim();

const includesSegmentKeyword = (label: string, keyword: string): boolean =>
    label.toLowerCase().includes(keyword);

export const normalizeSegmentPercent = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return 0;
    }
    const percent = numeric <= 1 ? numeric * 100 : numeric;
    return Math.min(100, Math.round(percent * 10) / 10);
};

export const npsScoreTone = (score: number | null | undefined): NpsScoreTone => {
    if (score === null || score === undefined || !Number.isFinite(Number(score))) {
        return 'unknown';
    }
    const rounded = Math.round(Number(score));
    if (rounded >= 50) return 'strong';
    if (rounded >= 0) return 'neutral';
    return 'negative';
};

export { formatSignedNps };

export const formatNpsGaugeScore = (score: number | null | undefined): string => {
    if (score === null || score === undefined || !Number.isFinite(Number(score))) {
        return 'N/A';
    }
    return formatSignedNps(score);
};

export const getNpsScoreBadgeClasses = (score: number | null | undefined, isDark: boolean): string => {
    const base =
        'shrink-0 min-w-[4.5rem] text-center px-3 py-2 rounded-2xl text-xl font-black font-mono tabular-nums tracking-tight';
    switch (npsScoreTone(score)) {
        case 'strong':
            return `${base} ${isDark ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'}`;
        case 'neutral':
            return `${base} ${isDark ? 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-500/25' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'}`;
        case 'negative':
            return `${base} ${isDark ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'}`;
        default:
            return `${base} ${isDark ? 'bg-white/5 text-slate-500 ring-1 ring-white/10' : 'bg-slate-50 text-slate-400 ring-1 ring-slate-100'}`;
    }
};

const isSegmentRowLabels = (labels: string[]): boolean =>
    labels.length > 0 && labels.every((label) => NPS_SEGMENT_LABELS.has(normalizeSegmentLabel(label)));

const findDatasetValues = (datasets: DatasetLike[], segment: NpsSegmentKey): unknown[] | null => {
    const match = datasets.find((dataset) =>
        includesSegmentKeyword(normalizeSegmentLabel(dataset.label), segment.toLowerCase().slice(0, -1)),
    );
    return Array.isArray(match?.data) ? match.data : null;
};

const resolveNpsScore = (
    brand: string,
    npsScores: Record<string, unknown> | undefined,
    segments: SegmentLike[] | undefined,
): number | null => {
    if (npsScores && brand in npsScores) {
        const score = Number(npsScores[brand]);
        return Number.isFinite(score) ? Math.round(score) : null;
    }

    const segment = segments?.find((row) => String(row.brand ?? '') === brand);
    if (segment && segment.nps !== undefined) {
        const score = Number(segment.nps);
        return Number.isFinite(score) ? Math.round(score) : null;
    }

    return null;
};

const buildBrandRow = (
    brand: string,
    detractors: unknown,
    passives: unknown,
    promoters: unknown,
    npsScores: Record<string, unknown> | undefined,
    segments: SegmentLike[] | undefined,
): NpsBrandRow => ({
    brand,
    detractors: normalizeSegmentPercent(detractors),
    passives: normalizeSegmentPercent(passives),
    promoters: normalizeSegmentPercent(promoters),
    nps: resolveNpsScore(brand, npsScores, segments),
});

const extractFromCanonical = (data: Record<string, unknown>): NpsBrandRow[] => {
    const labels = asLabels(data.labels);
    const datasets = asDatasets(data.datasets);
    if (!labels.length || !datasets.length || isSegmentRowLabels(labels)) {
        return [];
    }

    const detractors = findDatasetValues(datasets, 'Detractors');
    const passives = findDatasetValues(datasets, 'Passives');
    const promoters = findDatasetValues(datasets, 'Promoters');
    if (!detractors || !passives || !promoters) {
        return [];
    }

    const npsScores = isRecord(data.nps_scores) ? data.nps_scores : undefined;
    const segments = Array.isArray(data.segments)
        ? data.segments.filter((item): item is SegmentLike => isRecord(item))
        : undefined;

    return labels.map((brand, index) =>
        buildBrandRow(
            brand,
            detractors[index],
            passives[index],
            promoters[index],
            npsScores,
            segments,
        ),
    );
};

const extractFromTransposedSegmentRows = (data: Record<string, unknown>): NpsBrandRow[] => {
    const labels = asLabels(data.labels);
    const datasets = asDatasets(data.datasets);
    if (!isSegmentRowLabels(labels) || !datasets.length) {
        return [];
    }

    const npsScores = isRecord(data.nps_scores) ? data.nps_scores : undefined;
    const segments = Array.isArray(data.segments)
        ? data.segments.filter((item): item is SegmentLike => isRecord(item))
        : undefined;

    return datasets.map((dataset, index) => {
        const values = Array.isArray(dataset.data) ? dataset.data : [];
        const brand = normalizeSegmentLabel(dataset.label) || `Brand ${index + 1}`;
        return buildBrandRow(
            brand,
            values[2],
            values[1],
            values[0],
            npsScores,
            segments,
        );
    });
};

const extractFromFlatSingleBrand = (data: Record<string, unknown>): NpsBrandRow[] => {
    const hasFlatSegments =
        data.detractors !== undefined || data.passives !== undefined || data.promoters !== undefined;
    if (!hasFlatSegments && data.nps === undefined) {
        return [];
    }

    const brand =
        (typeof data.brand === 'string' && data.brand) ||
        (Array.isArray(data.segments) &&
            isRecord(data.segments[0]) &&
            typeof data.segments[0].brand === 'string' &&
            data.segments[0].brand) ||
        'Overall';

    const npsScores = isRecord(data.nps_scores) ? data.nps_scores : undefined;
    const segments = Array.isArray(data.segments)
        ? data.segments.filter((item): item is SegmentLike => isRecord(item))
        : undefined;

    const flatNps = data.nps !== undefined ? Number(data.nps) : null;
    const row = buildBrandRow(
        brand,
        data.detractors,
        data.passives,
        data.promoters,
        npsScores,
        segments,
    );

    if (row.nps === null && flatNps !== null && Number.isFinite(flatNps)) {
        row.nps = Math.round(flatNps);
    }

    return [row];
};

export const extractNpsGaugeBrands = (data: unknown): NpsBrandRow[] => {
    if (!isRecord(data)) {
        return [];
    }

    const canonical = extractFromCanonical(data);
    if (canonical.length) {
        return canonical;
    }

    const transposed = extractFromTransposedSegmentRows(data);
    if (transposed.length) {
        return transposed;
    }

    return extractFromFlatSingleBrand(data);
};

export const hasNpsGaugeData = (data: unknown): boolean => extractNpsGaugeBrands(data).length > 0;
