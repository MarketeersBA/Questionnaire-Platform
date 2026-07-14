import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as exportUtils from './exportUtils';
import {
    assessChartCsvExport,
    buildChartCsvTabular,
    buildChartCsvContent,
    chartCsvFilename,
    exportChartCsv,
    flattenRecords,
    heatmapToRows,
    labelsDatasetsToRows,
    profileToRows,
    scatterToRows,
    tableToRows,
    wordCloudToRows,
} from './chartCsvExport';
import {
    EMPTY_TABLE_CHART,
    LABELS_DATASETS_CHART,
    SCATTER_CHART,
    TABLE_CHART,
    UNSUPPORTED_CHART,
    WORD_CLOUD_CHART,
} from './chartCsvExport/__tests__/fixtures';
describe('chartCsvExport', () => {
    describe('chartCsvFilename', () => {
        it('builds stable filename from chart id and title', () => {
            const name = chartCsvFilename(
                { chart_id: 'purchase_intent', title: 'Purchase Intent' },
                new Date('2026-05-24T12:00:00Z')
            );
            expect(name).toBe('purchase-intent_purchase-intent_2026-05-24.csv');
        });

        it('includes both chart id and title when both are present', () => {
            const name = chartCsvFilename(
                { chart_id: 'overall_averages', title: 'Overall Averages' },
                new Date('2026-05-24T12:00:00Z')
            );
            expect(name).toBe('overall-averages_overall-averages_2026-05-24.csv');
        });
    });

    describe('labelsDatasetsToRows', () => {
        it('exports wide format for bar/line/radar style payloads', () => {
            const result = labelsDatasetsToRows({
                labels: ['A', 'B'],
                datasets: [
                    { label: 'Brand X', data: [1, 2] },
                    { label: 'Brand Y', data: [3, 4] },
                ],
            });
            expect(result?.source).toBe('labels_datasets');
            expect(result?.rows).toHaveLength(2);
            expect(result?.rows[0]).toMatchObject({ label: 'A', series_0: 1, series_1: 3 });
        });

        it('returns null when datasets are XY scatter points', () => {
            const result = labelsDatasetsToRows({
                labels: ['A'],
                datasets: [{ label: 'S', data: [{ x: 1, y: 2 }] }],
            });
            expect(result).toBeNull();
        });
    });

    describe('tableToRows', () => {
        it('exports columns/rows tables', () => {
            const result = tableToRows({ columns: ['Metric', 'Score'], rows: [['NPS', 42]] });
            expect(result?.source).toBe('table');
            expect(result?.rows[0]).toMatchObject({ col_0: 'NPS', col_1: 42 });
        });

        it('exports criteria raw with dynamic brand columns', () => {
            const result = tableToRows({
                raw: [
                    {
                        criteria_name: 'Taste',
                        brand_scores: { A: 80 },
                        significance: 0.05,
                    },
                ],
            });
            expect(result?.source).toBe('raw_criteria');
            expect(result?.rows[0]).toMatchObject({ criteria_name: 'Taste', brand_A: 80 });
        });
    });

    describe('scatterToRows', () => {
        it('exports long format for scatter datasets', () => {
            const result = scatterToRows(
                {
                    datasets: [
                        {
                            label: 'Brand A',
                            data: [{ x: 1, y: 2, attribute: 'Sweet', n: 50 }],
                        },
                    ],
                },
                { chart: { chart_id: 'overall_scatter', title: 'Scatter' } }
            );
            expect(result?.source).toBe('scatter');
            expect(result?.rows[0]).toMatchObject({ series: 'Brand A', x: 1, y: 2 });
        });
    });

    describe('heatmapToRows', () => {
        it('exports affinity heatmap cells', () => {
            const result = heatmapToRows({
                heatmap: [{ field: 'Age', segment: '18-24', brand: 'X', aai: 1.2 }],
            });
            expect(result?.source).toBe('heatmap');
            expect(result?.rows[0]).toMatchObject({ field: 'Age', aai: 1.2 });
        });

        it('exports importance matrix rows', () => {
            const result = heatmapToRows({
                matrix: [{ feature: 'Taste', importance: 0.8, BrandA: 70 }],
            });
            expect(result?.source).toBe('heatmap');
            expect(result?.rows[0]).toMatchObject({ feature: 'Taste', perf_BrandA: 70 });
        });
    });

    describe('wordCloudToRows', () => {
        it('exports word frequency lists', () => {
            const result = wordCloudToRows({
                words: [{ text: 'crispy', value: 12 }],
                brand: 'Abu Auf',
            });
            expect(result?.source).toBe('wordcloud');
            expect(result?.rows[0]).toMatchObject({ text: 'crispy', value: 12, brand: 'Abu Auf' });
        });
    });

    describe('profileToRows', () => {
        it('exports scorecard profile and strengths', () => {
            const result = profileToRows(
                {
                    profile: { Awareness: 80 },
                    strengths: [{ attribute: 'Taste', score: 90 }],
                },
                { chart: { chart_id: 'brand_scorecard', chart_type: 'scorecard' } }
            );
            expect(result?.source).toBe('profile');
            expect(result?.rows.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('flattenRecords', () => {
        it('flattens unknown object keys', () => {
            const result = flattenRecords({ foo: 'bar', insight: 'skip me' });
            expect(result?.source).toBe('flatten');
            expect(result?.rows).toContainEqual({ key: 'foo', value: 'bar' });
            expect(result?.rows.some((r) => r.key === 'insight')).toBe(false);
        });

        it('returns null when only narrative keys exist in data', () => {
            expect(flattenRecords({ insight: 'Neural narrative', ai_headline: 'Headline' })).toBeNull();
        });
    });

    describe('assessChartCsvExport (Phase 4 UX)', () => {
        it('marks exportable charts as ready with row count and filename', () => {
            const assessment = assessChartCsvExport({
                chart_id: 'nps',
                title: 'NPS Score',
                data: { labels: ['Promoters'], datasets: [{ label: 'Score', data: [72] }] },
            });
            expect(assessment.canExport).toBe(true);
            expect(assessment.status).toBe('ready');
            expect(assessment.rowCount).toBe(1);
            expect(assessment.filename).toContain('nps');
            expect(assessment.filename).toContain('nps-score');
        });

        it('disables export for empty tabular data', () => {
            const assessment = assessChartCsvExport({
                chart_id: 'empty_table',
                title: 'Empty',
                data: { columns: ['A'], rows: [] },
            });
            expect(assessment.canExport).toBe(false);
            expect(assessment.status).toBe('empty');
            expect(assessment.reason).toBeTruthy();
        });

        it('disables export when data is narrative-only', () => {
            const assessment = assessChartCsvExport({
                chart_id: 'ai_only',
                title: 'Insights',
                data: { insight: 'Only narrative text here' },
            });
            expect(assessment.canExport).toBe(false);
            expect(assessment.status).toBe('unsupported');
        });
    });

    describe('Phase 4 safety', () => {
        it('does not mutate the source chart payload', () => {
            vi.spyOn(exportUtils, 'downloadFile').mockImplementation(() => undefined);

            const chart = {
                chart_id: 'stable',
                title: 'Stable',
                data: {
                    labels: ['A'],
                    datasets: [{ label: 'Series', data: [10] }],
                },
            };
            const snapshot = JSON.stringify(chart);
            buildChartCsvTabular(chart);
            exportChartCsv(chart);
            expect(JSON.stringify(chart)).toBe(snapshot);
        });

        it('preserves numeric cell types after pipeline finalize', () => {
            const tabular = buildChartCsvTabular({
                chart_id: 'nums',
                data: { labels: ['Q1'], datasets: [{ label: 'Score', data: [42.5] }] },
            });
            expect(typeof tabular?.rows[0]?.series_0).toBe('number');
            expect(tabular?.rows[0]?.series_0).toBe(42.5);
        });

        it('escapes CSV via generateCSV for quoted labels', () => {
            const built = buildChartCsvContent({
                chart_id: 'escape',
                title: 'Escape Test',
                data: {
                    labels: ['Say "hello", team'],
                    datasets: [{ label: 'Value', data: [1] }],
                },
            });
            expect(built?.content).toContain('Say ""hello"", team');
        });
    });

    describe('buildChartCsvTabular (pipeline)', () => {
        it('routes labels/datasets charts through labels converter', () => {
            const tabular = buildChartCsvTabular({
                chart_id: 'overall_averages',
                data: {
                    labels: ['A'],
                    datasets: [{ label: 'X', data: [1] }],
                },
            });
            expect(tabular?.source).toBe('labels_datasets');
        });

        it('routes scatter before labels when XY points present', () => {
            const tabular = buildChartCsvTabular({
                chart_id: 'positioning',
                data: {
                    labels: ['ignored'],
                    datasets: [{ label: 'B', data: [{ x: 1, y: 2 }] }],
                },
            });
            expect(tabular?.source).toBe('scatter');
        });
    });

    describe('exportChartCsv', () => {
        beforeEach(() => {
            vi.spyOn(exportUtils, 'downloadFile').mockImplementation(() => undefined);
        });

        it('returns exported status when data is valid', () => {
            const result = exportChartCsv({
                chart_id: 'nps',
                title: 'NPS',
                data: { labels: ['Q1'], datasets: [{ label: 'Score', data: [9] }] },
            });

            expect(result.status).toBe('exported');
            expect(result.rowCount).toBe(1);
            expect(result.filename).toContain('nps');
            expect(exportUtils.downloadFile).toHaveBeenCalled();
        });

        it('returns unsupported for empty object', () => {
            const result = exportChartCsv({
                chart_id: 'empty',
                title: 'Empty',
                data: {},
            });
            expect(result.status).toBe('unsupported');
        });
    });

    describe('buildChartCsvContent', () => {
        it('produces non-empty CSV string', () => {
            const built = buildChartCsvContent(TABLE_CHART);
            expect(built?.content).toContain('"Brand"');
            expect(built?.tabular.source).toBe('table');
        });
    });

    describe('Phase 5 fixture smoke (shared payloads)', () => {
        it.each([
            ['labels/datasets', LABELS_DATASETS_CHART, 'labels_datasets'],
            ['table', TABLE_CHART, 'table'],
            ['scatter', SCATTER_CHART, 'scatter'],
            ['word cloud', WORD_CLOUD_CHART, 'wordcloud'],
        ] as const)('routes %s chart through %s converter', (_label, chart, source) => {
            expect(buildChartCsvTabular(chart)?.source).toBe(source);
            expect(assessChartCsvExport(chart).canExport).toBe(true);
        });

        it.each([
            ['empty table', EMPTY_TABLE_CHART, 'empty'],
            ['unsupported', UNSUPPORTED_CHART, 'unsupported'],
        ] as const)('blocks %s export (%s)', (_label, chart, status) => {
            expect(assessChartCsvExport(chart).canExport).toBe(false);
            expect(assessChartCsvExport(chart).status).toBe(status);
        });
    });
});
