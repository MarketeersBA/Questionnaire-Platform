import type { ChartCsvTabular } from '../types';
import { asNumber, asString, dataHasScatterDatasets, isRecord } from '../helpers';

/**
 * Chart.js-style `{ labels, datasets }` → wide CSV.
 * Covers bar, line, radar, stacked, funnel, grouped_bar, preference_bar, etc.
 * Returns null when shape does not match or datasets are XY scatter points.
 */
export function labelsDatasetsToRows(data: Record<string, unknown>): ChartCsvTabular | null {
    if (dataHasScatterDatasets(data)) return null;

    const labels = data.labels;
    const datasets = data.datasets;
    if (!Array.isArray(datasets) || datasets.length === 0) return null;

    const labelList: unknown[] = Array.isArray(labels) && labels.length > 0
        ? labels
        : inferLabelsFromDatasets(datasets);

    if (labelList.length === 0) return null;

    const seriesMeta = datasets.map((ds, idx) => {
        if (!isRecord(ds)) return { key: `series_${idx}`, header: `Series ${idx + 1}` };
        return {
            key: `series_${idx}`,
            header: asString(ds.label ?? ds.brand ?? `Series ${idx + 1}`),
        };
    });

    const columns = [
        { header: 'Label', key: 'label' },
        ...seriesMeta.map((s) => ({ header: s.header, key: s.key })),
    ];

    const rows = labelList.map((label, labelIdx) => {
        const row: Record<string, unknown> = { label: asString(label) };
        datasets.forEach((ds, dsIdx) => {
            const values = isRecord(ds) && Array.isArray(ds.data) ? ds.data : [];
            row[`series_${dsIdx}`] = asNumber(values[labelIdx]);
        });
        return row;
    });

    return { columns, rows, source: 'labels_datasets' };
}

function inferLabelsFromDatasets(datasets: unknown[]): unknown[] {
    let maxLen = 0;
    for (const ds of datasets) {
        if (isRecord(ds) && Array.isArray(ds.data)) {
            maxLen = Math.max(maxLen, ds.data.length);
        }
    }
    if (maxLen === 0) return [];
    return Array.from({ length: maxLen }, (_, i) => `Row ${i + 1}`);
}
