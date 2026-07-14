import type { ChartCsvTabular, ShapeConverterContext } from '../types';
import { asNumber, asString, isRecord } from '../helpers';

const PROFILE_COLUMNS = [
    { header: 'Section', key: 'section' },
    { header: 'Metric', key: 'metric' },
    { header: 'Value', key: 'value' },
    { header: 'Score', key: 'score' },
];

/**
 * Scorecards, brand profiles, and metric/strength payloads (not labels+datasets series).
 */
export function profileToRows(
    data: Record<string, unknown>,
    ctx: ShapeConverterContext
): ChartCsvTabular | null {
    const chart = ctx.chart;
    const rows: Record<string, unknown>[] = [];

    if (Array.isArray(data.metrics)) {
        for (const m of data.metrics) {
            if (!isRecord(m)) continue;
            rows.push({
                section: 'Profile',
                metric: asString(m.label ?? m.metric),
                value: asString(m.value),
                score: asNumber(m.score ?? m.value),
            });
        }
    }

    if (isRecord(data.profile)) {
        for (const [key, value] of Object.entries(data.profile)) {
            rows.push({
                section: 'Profile',
                metric: key,
                value: asString(value),
                score: asNumber(value),
            });
        }
    }

    if (Array.isArray(data.strengths)) {
        for (const s of data.strengths) {
            if (!isRecord(s)) continue;
            rows.push({
                section: 'Strength',
                metric: asString(s.attribute ?? s.label ?? s.name),
                value: '',
                score: asNumber(s.score ?? s.value),
            });
        }
    }

    if (Array.isArray(data.weaknesses)) {
        for (const w of data.weaknesses) {
            if (!isRecord(w)) continue;
            rows.push({
                section: 'Weakness',
                metric: asString(w.attribute ?? w.label ?? w.name),
                value: '',
                score: asNumber(w.score ?? w.value),
            });
        }
    }

    if (rows.length === 0 && hasProfileShapeHint(data, chart)) {
        rows.push({
            section: 'Meta',
            metric: 'Brand',
            value: asString(data.brand ?? chart.title),
            score: asNumber(data.n_size ?? chart.base_n),
        });
    }

    return rows.length ? { columns: PROFILE_COLUMNS, rows, source: 'profile' } : null;
}

function hasProfileShapeHint(data: Record<string, unknown>, chart: ShapeConverterContext['chart']): boolean {
    const type = (chart.chart_type ?? '').toLowerCase();
    return (
        type === 'scorecard' ||
        type === 'profile_chart' ||
        Boolean(data.brand && (data.n_size !== undefined || chart.base_n))
    );
}
