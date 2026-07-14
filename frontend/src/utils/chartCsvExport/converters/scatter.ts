import type { ChartCsvTabular, ShapeConverterContext } from '../types';
import { asNumber, asString, isRecord } from '../helpers';

const SCATTER_COLUMNS = [
    { header: 'Series', key: 'series' },
    { header: 'Label', key: 'label' },
    { header: 'Attribute', key: 'attribute' },
    { header: 'X', key: 'x' },
    { header: 'Y', key: 'y' },
    { header: 'N', key: 'n' },
    { header: 'Brand', key: 'brand' },
    { header: 'Quadrant', key: 'quadrant' },
];

const normalizeScatterPoint = (point: unknown): Record<string, unknown> | null => {
    if (!isRecord(point)) return null;
    return {
        label: asString(point.label ?? point.name ?? point.attribute ?? point.brand),
        attribute: asString(point.attribute ?? point.name ?? point.label),
        x: asNumber(point.x ?? point.x_val ?? point.impact),
        y: asNumber(point.y ?? point.y_val ?? point.performance),
        n: asNumber(point.n ?? point.sample_size ?? point.count),
        brand: asString(point.brand),
        quadrant: asString(point.quadrant),
    };
};

/**
 * Long-format CSV for scatter, bubble, sigma intent, positioning matrix payloads.
 */
export function scatterToRows(
    data: Record<string, unknown>,
    ctx: ShapeConverterContext
): ChartCsvTabular | null {
    const rows: Record<string, unknown>[] = [];
    const chart = ctx.chart;

    const datasets = data.datasets;
    if (Array.isArray(datasets)) {
        for (const dataset of datasets) {
            if (!isRecord(dataset)) continue;
            const series = asString(dataset.label ?? dataset.brand ?? chart.title ?? 'Series');
            const points = dataset.data;
            if (!Array.isArray(points)) continue;
            for (const point of points) {
                const normalized = normalizeScatterPoint(point);
                if (!normalized) continue;
                rows.push({
                    series,
                    ...normalized,
                    brand: normalized.brand || asString(dataset.brand ?? dataset.label),
                });
            }
        }
    }

    if (rows.length === 0 && isRecord(data.datasets)) {
        for (const [attr, points] of Object.entries(data.datasets)) {
            if (!Array.isArray(points)) continue;
            for (const point of points) {
                const normalized = normalizeScatterPoint(point);
                if (!normalized) continue;
                rows.push({
                    series: attr,
                    ...normalized,
                    attribute: normalized.attribute || attr,
                });
            }
        }
    }

    if (rows.length === 0 && Array.isArray(data.points)) {
        for (const point of data.points) {
            const normalized = normalizeScatterPoint(point);
            if (!normalized) continue;
            rows.push({ series: chart.title ?? 'Series', ...normalized });
        }
    }

    return rows.length ? { columns: SCATTER_COLUMNS, rows, source: 'scatter' } : null;
}
