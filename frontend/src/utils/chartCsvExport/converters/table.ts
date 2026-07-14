import type { ChartCsvTabular } from '../types';
import { asNumber, asString, isRecord } from '../helpers';
import { coerceExportCell } from '../safety';
/**
 * Table-style payloads: `{ columns, rows }`, nested `table`, or criteria `raw[]`.
 */
export function tableToRows(data: Record<string, unknown>): ChartCsvTabular | null {
    const criteria = criteriaRawToRows(data);
    if (criteria) return criteria;

    let columns = data.columns;
    let rows = data.rows;

    if (isRecord(data.table)) {
        columns = data.table.columns ?? columns;
        rows = data.table.rows ?? rows;
    }

    if (!Array.isArray(columns) || !Array.isArray(rows) || columns.length === 0) {
        return null;
    }

    const colDefs = columns.map((col, idx) => ({
        header: asString(col) || `Column ${idx + 1}`,
        key: `col_${idx}`,
    }));

    if (rows.length === 0) {
        return { columns: colDefs, rows: [], source: 'table' };
    }

    const tabularRows = rows.map((row) => {
        const cells = Array.isArray(row) ? row : [row];
        const out: Record<string, unknown> = {};
        colDefs.forEach((col, idx) => {
            out[col.key] = coerceExportCell(cells[idx] ?? '');
        });        return out;
    });

    return { columns: colDefs, rows: tabularRows, source: 'table' };
}

/** Rich criteria table with dynamic brand score columns */
function criteriaRawToRows(data: Record<string, unknown>): ChartCsvTabular | null {
    const raw = data.raw;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const brandKeys = new Set<string>();
    for (const item of raw) {
        if (!isRecord(item)) continue;
        const scores = item.brand_scores;
        if (isRecord(scores)) Object.keys(scores).forEach((k) => brandKeys.add(k));
    }

    const brands = Array.from(brandKeys).sort();
    const columns = [
        { header: 'Criteria', key: 'criteria_name' },
        { header: 'Significance', key: 'significance' },
        ...brands.map((b) => ({ header: b, key: `brand_${b}` })),
        { header: 'Our Brand T2B', key: 'our_brand_t2b' },
        { header: 'Competitor T2B', key: 'competitor_t2b' },
        { header: 'Diff', key: 'diff' },
    ];

    const rows = raw
        .map((item) => {
            if (!isRecord(item)) return null;
            const row: Record<string, unknown> = {
                criteria_name: asString(item.criteria_name),
                significance: asNumber(item.significance),
                our_brand_t2b: asNumber(item.our_brand_t2b),
                competitor_t2b: asNumber(item.competitor_t2b),
                diff: asNumber(item.diff),
            };
            const scores = isRecord(item.brand_scores) ? item.brand_scores : {};
            for (const brand of brands) {
                row[`brand_${brand}`] = asNumber(scores[brand]);
            }
            return row;
        })
        .filter(Boolean) as Record<string, unknown>[];

    return rows.length ? { columns, rows, source: 'raw_criteria' } : null;
}
