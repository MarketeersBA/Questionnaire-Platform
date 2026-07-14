import { NARRATIVE_DATA_KEYS, coerceExportCell, hasStructuralChartShape } from '../safety';
import type { ChartCsvTabular } from '../types';
import { isRecord } from '../helpers';

/**
 * Defensive fallback: array of records, primitive arrays, or key/value object flattening.
 * Skips narrative/AI keys; never returns live references into chart.data.
 */
export function flattenRecords(data: unknown): ChartCsvTabular | null {
    if (Array.isArray(data)) {
        return flattenArrayRoot(data);
    }
    if (!isRecord(data)) return null;
    return flattenObjectRoot(data);
}

function flattenArrayRoot(data: unknown[]): ChartCsvTabular | null {
    if (data.length === 0) return null;

    if (isRecord(data[0])) {
        const keys = Array.from(
            new Set(
                data.flatMap((item) =>
                    isRecord(item) ? Object.keys(item).filter((k) => !NARRATIVE_DATA_KEYS.has(k)) : []
                )
            )
        );
        if (keys.length === 0) return null;
        const columns = keys.map((k) => ({ header: k, key: k }));
        const rows = data
            .filter(isRecord)
            .map((item) => {
                const row: Record<string, unknown> = {};
                for (const key of keys) {
                    row[key] = coerceExportCell(item[key]);
                }
                return row;
            });
        return rows.length ? { columns, rows, source: 'flatten' } : null;
    }

    return {
        columns: [
            { header: 'Index', key: 'index' },
            { header: 'Value', key: 'value' },
        ],
        rows: data.map((v, i) => ({ index: i + 1, value: coerceExportCell(v) })),
        source: 'flatten',
    };
}

function flattenObjectRoot(data: Record<string, unknown>): ChartCsvTabular | null {
    if (hasStructuralChartShape(data)) return null;

    const entries = Object.entries(data).filter(([k]) => !NARRATIVE_DATA_KEYS.has(k));
    if (entries.length === 0) return null;

    const rows = entries.map(([key, value]) => ({
        key,
        value:
            typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : coerceExportCell(value),
    }));

    return {
        columns: [
            { header: 'Key', key: 'key' },
            { header: 'Value', key: 'value' },
        ],
        rows,
        source: 'flatten',
    };
}
