import {
    resolveBrandComparisonSeries,
    type BrandComparisonChartDataLike,
} from '../../brandComparisonSeries';
import type { ChartCsvTabular, ShapeConverterContext } from '../types';
import { isRecord } from '../helpers';

const PI_COLUMN = 'Purchase Intent (T2B%)';
const OL_COLUMN = 'Overall Likability';

const isBrandComparisonChart = (ctx: ShapeConverterContext): boolean => {
    const chartType = String(ctx.chart.chart_type ?? '').toLowerCase();
    const chartId = String(ctx.chart.chart_id ?? '').toLowerCase();
    return chartType === 'brand_comparison' || chartId === 'brand_comparison_pi_ol';
};

/**
 * Brand Strategic Comparison → fixed wide CSV (Label + PI + Likability).
 * Runs before profileToRows so extra profile/metrics fields cannot hijack export.
 */
export function brandComparisonToRows(
    data: Record<string, unknown>,
    ctx: ShapeConverterContext,
): ChartCsvTabular | null {
    if (!isBrandComparisonChart(ctx)) return null;
    if (!isRecord(data)) return null;

    const resolved = resolveBrandComparisonSeries(data as BrandComparisonChartDataLike);
    if (resolved.labels.length === 0) return null;

    const columns = [
        { header: 'Label', key: 'label' },
        { header: PI_COLUMN, key: 'purchase_intent' },
        { header: OL_COLUMN, key: 'overall_likability' },
    ];

    const rows = resolved.labels.map((label, idx) => ({
        label,
        purchase_intent: resolved.purchaseIntent[idx] ?? '',
        overall_likability: resolved.likability[idx] ?? '',
    }));

    return { columns, rows, source: 'brand_comparison' };
}
