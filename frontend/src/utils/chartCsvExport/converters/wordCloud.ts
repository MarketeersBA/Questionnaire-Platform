import type { ChartCsvTabular } from '../types';
import { asNumber, asString, isRecord } from '../helpers';

/**
 * Open-end / verbatim frequency lists: `words`, `terms`, or `items`.
 */
export function wordCloudToRows(data: Record<string, unknown>): ChartCsvTabular | null {
    const words =
        (Array.isArray(data.words) && data.words) ||
        (Array.isArray(data.terms) && data.terms) ||
        (Array.isArray(data.items) && data.items);

    if (!words || words.length === 0) return null;

    const columns = [
        { header: 'Word', key: 'text' },
        { header: 'Count', key: 'value' },
        { header: 'Brand', key: 'brand' },
    ];

    const defaultBrand = asString(data.brand);
    const rows = words.map((item) => {
        if (isRecord(item)) {
            return {
                text: asString(item.text ?? item.term ?? item.label),
                value: asNumber(item.value ?? item.weight ?? item.count),
                brand: asString(item.brand ?? defaultBrand),
            };
        }
        return { text: asString(item), value: 1, brand: defaultBrand };
    });

    return { columns, rows, source: 'wordcloud' };
}
