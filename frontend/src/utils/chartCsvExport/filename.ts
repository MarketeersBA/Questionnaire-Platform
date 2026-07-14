import type { ChartPayloadLike } from './types';

const sanitizeFilenamePart = (value: string, maxLen = 48): string => {
    const cleaned = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return (cleaned || 'chart').slice(0, maxLen);
};

/**
 * Stable download name: `{chart_id}_{sanitized-title}_{YYYY-MM-DD}.csv`
 * Always includes chart id; title falls back to chart_id when absent.
 */
export const chartCsvFilename = (chart: ChartPayloadLike, date = new Date()): string => {
    const idPart = sanitizeFilenamePart(chart.chart_id || 'chart', 64);
    const titlePart = sanitizeFilenamePart(chart.title || chart.chart_id || 'export', 48);
    const day = date.toISOString().slice(0, 10);
    return `${idPart}_${titlePart}_${day}.csv`;
};
