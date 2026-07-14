import type { ChartCsvTabular } from '../types';
import { asNumber, asString, isRecord } from '../helpers';

/**
 * Heatmap-style payloads: audience affinity `heatmap[]` and importance `matrix[]`.
 */
export function heatmapToRows(data: Record<string, unknown>): ChartCsvTabular | null {
    const affinity = affinityHeatmapToRows(data);
    if (affinity) return affinity;

    return importanceMatrixToRows(data);
}

function affinityHeatmapToRows(data: Record<string, unknown>): ChartCsvTabular | null {
    const heatmap = data.heatmap;
    if (!Array.isArray(heatmap) || heatmap.length === 0) return null;

    const columns = [
        { header: 'Field', key: 'field' },
        { header: 'Segment', key: 'segment' },
        { header: 'Brand', key: 'brand' },
        { header: 'AAI', key: 'aai' },
        { header: 'P_obs', key: 'p_obs' },
        { header: 'P_exp', key: 'p_exp' },
        { header: 'N_segment', key: 'n_segment' },
        { header: 'Is Target', key: 'is_target' },
    ];

    const rows = heatmap
        .map((point) => {
            if (!isRecord(point)) return null;
            return {
                field: asString(point.field),
                segment: asString(point.segment),
                brand: asString(point.brand),
                aai: asNumber(point.aai),
                p_obs: asNumber(point.p_obs),
                p_exp: asNumber(point.p_exp),
                n_segment: asNumber(point.n_segment),
                is_target: point.is_target === true ? 'Yes' : point.is_target === false ? 'No' : '',
            };
        })
        .filter(Boolean) as Record<string, unknown>[];

    return rows.length ? { columns, rows, source: 'heatmap' } : null;
}

function importanceMatrixToRows(data: Record<string, unknown>): ChartCsvTabular | null {
    const matrix = data.matrix;
    if (!Array.isArray(matrix) || matrix.length === 0) return null;
    if (!isRecord(matrix[0])) return null;

    const reserved = new Set(['feature', 'importance']);
    const brandKeys = Object.keys(matrix[0]).filter((k) => !reserved.has(k));

    const columns = [
        { header: 'Feature', key: 'feature' },
        { header: 'Importance', key: 'importance' },
        ...brandKeys.map((b) => ({ header: `${b} Performance`, key: `perf_${b}` })),
    ];

    const rows = matrix
        .map((item) => {
            if (!isRecord(item)) return null;
            const row: Record<string, unknown> = {
                feature: asString(item.feature),
                importance: asNumber(item.importance),
            };
            for (const brand of brandKeys) {
                row[`perf_${brand}`] = asNumber(item[brand]);
            }
            return row;
        })
        .filter(Boolean) as Record<string, unknown>[];

    return rows.length ? { columns, rows, source: 'heatmap' } : null;
}
