import { generateCSV } from '../exportUtils';
import { resolveChartCsvTabular } from './pipeline';
import type { ChartCsvTabular, ChartPayloadLike } from './types';

/**
 * Builds CSV string via shared generateCSV() — all escaping stays centralized in exportUtils.
 */
export const buildChartCsvContent = (
    chart: ChartPayloadLike
): { content: string; tabular: ChartCsvTabular } | null => {
    const tabular = resolveChartCsvTabular(chart);
    if (!tabular || tabular.rows.length === 0) return null;

    const content = generateCSV(tabular.rows, tabular.columns);
    if (!content.trim()) return null;

    return { content, tabular };
};
