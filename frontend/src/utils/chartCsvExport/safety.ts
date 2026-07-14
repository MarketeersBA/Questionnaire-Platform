import type { ChartCsvTabular, ChartPayloadLike } from './types';
import { asString, isRecord } from './helpers';

/**
 * Keys excluded from flatten fallback — narrative / AI fields not meant for tabular export.
 * Only applies to `chart.data`; top-level chart fields (insight, ai_headline) are never read.
 */
export const NARRATIVE_DATA_KEYS = new Set([
    'insight',
    'metadata',
    'ai_headline',
    'ai_deep_analysis',
    'ai_insight',
    'deep_analysis',
    'narrative',
    'summary',
    'headline',
    'footnote',
    'interpretation',
    'recommendation',
    'recommendations',
]);

export const isNarrativeDataKey = (key: string): boolean => NARRATIVE_DATA_KEYS.has(key);

/** Top-level keys owned by dedicated converters — flatten must not reinterpret them */
export const STRUCTURAL_CHART_DATA_KEYS = new Set([
    'columns',
    'rows',
    'table',
    'datasets',
    'labels',
    'raw',
    'matrix',
    'heatmap',
    'words',
    'terms',
    'items',
    'points',
    'profile',
    'metrics',
    'strengths',
    'weaknesses',
]);

export const hasStructuralChartShape = (data: Record<string, unknown>): boolean =>
    Object.keys(data).some((key) => STRUCTURAL_CHART_DATA_KEYS.has(key));

/**
 * Shallow snapshot of chart fields used for export — never mutates the source chart object.
 */
export const snapshotChartForExport = (chart: ChartPayloadLike): ChartPayloadLike => ({
    chart_id: chart.chart_id,
    chart_type: chart.chart_type,
    title: chart.title,
    subtitle: chart.subtitle,
    base_n: chart.base_n,
    brands: Array.isArray(chart.brands) ? [...chart.brands] : chart.brands,
    metadata: isRecord(chart.metadata) ? { ...chart.metadata } : chart.metadata,
    data: chart.data,
});

/**
 * Preserve finite numbers as numbers; coerce numeric strings; leave text as strings.
 */
export const coerceExportCell = (value: unknown): string | number | boolean | '' => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== '' && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
            const n = Number(trimmed);
            if (Number.isFinite(n)) return n;
        }
        return value;
    }
    if (typeof value === 'bigint') return Number(value);
    return asString(value);
};

/** Deep-enough row clone so CSV building never mutates chart.data references */
export const cloneExportRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        out[key] = coerceExportCell(value);
    }
    return out;
};

/** Finalize tabular output: detached rows + numeric coercion */
export const finalizeTabular = (tabular: ChartCsvTabular): ChartCsvTabular => ({
    columns: tabular.columns.map((col) => ({ ...col })),
    rows: tabular.rows.map(cloneExportRow),
    source: tabular.source,
});
