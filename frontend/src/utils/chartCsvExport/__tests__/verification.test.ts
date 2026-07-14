import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as exportUtils from '../../exportUtils';
import {
    assessChartCsvExport,
    buildChartCsvContent,
    buildChartCsvTabular,
    exportChartCsv,
} from '../index';
import {
    BRAND_STRATEGIC_COMPARISON_ALT_LABELS,
    BRAND_STRATEGIC_COMPARISON_CHART,
    BRAND_STRATEGIC_COMPARISON_WITH_PROFILE,
    EMPTY_TABLE_CHART,
    LABELS_DATASETS_CHART,
    NARRATIVE_ONLY_CHART,
    SCATTER_CHART,
    TABLE_CHART,
    UNSUPPORTED_CHART,
    WORD_CLOUD_CHART,
} from './fixtures';
import { csvDataRowCount, csvHeadersInclude, expectExportableCsv } from './csvAssert';

describe('Phase 5 — chart CSV export verification', () => {
    beforeEach(() => {
        vi.spyOn(exportUtils, 'downloadFile').mockImplementation(() => undefined);
    });

    describe('labels/datasets chart (bar, line, stacked, funnel)', () => {
        it('builds wide tabular rows with correct source', () => {
            const tabular = buildChartCsvTabular(LABELS_DATASETS_CHART);
            expect(tabular?.source).toBe('labels_datasets');
            expect(tabular?.rows).toHaveLength(3);
            expect(tabular?.rows[0]).toMatchObject({
                label: 'Definitely',
                series_0: 45,
                series_1: 30,
            });
        });

        it('produces valid CSV with Label and series headers', () => {
            const built = buildChartCsvContent(LABELS_DATASETS_CHART);
            expect(built).not.toBeNull();
            expectExportableCsv(built!.content, {
                minDataRows: 3,
                headers: ['Label', 'Our Brand', 'Competitor'],
                sampleValues: ['Definitely', 45, 30],
            });
        });

        it('assesses as ready and exports successfully', () => {
            const assessment = assessChartCsvExport(LABELS_DATASETS_CHART);
            expect(assessment.canExport).toBe(true);
            expect(assessment.status).toBe('ready');
            expect(assessment.rowCount).toBe(3);

            const result = exportChartCsv(LABELS_DATASETS_CHART);
            expect(result.status).toBe('exported');
            expect(result.source).toBe('labels_datasets');
            expect(result.filename).toContain('purchase-intent');
            expect(result.filename).toMatch(/_\d{4}-\d{2}-\d{2}\.csv$/);
            expect(exportUtils.downloadFile).toHaveBeenCalled();
        });
    });

    describe('table chart (columns / rows)', () => {
        it('maps columns and rows into tabular cells', () => {
            const tabular = buildChartCsvTabular(TABLE_CHART);
            expect(tabular?.source).toBe('table');
            expect(tabular?.rows).toHaveLength(2);
            expect(tabular?.rows[0]).toMatchObject({ col_0: 'Brand A', col_1: 82, col_2: 45 });
            expect(typeof tabular?.rows[0]?.col_1).toBe('number');
        });

        it('produces CSV with table headers and numeric cells', () => {
            const built = buildChartCsvContent(TABLE_CHART);
            expect(built).not.toBeNull();
            expectExportableCsv(built!.content, {
                minDataRows: 2,
                headers: ['Brand', 'Awareness', 'Trial'],
                sampleValues: ['Brand A', 82, 45],
            });
        });

        it('exports with table source and stable filename', () => {
            const result = exportChartCsv(TABLE_CHART);
            expect(result.status).toBe('exported');
            expect(result.source).toBe('table');
            expect(result.rowCount).toBe(2);
            expect(result.filename).toContain('reference-table');
        });
    });

    describe('scatter chart (XY datasets)', () => {
        it('exports long-format scatter rows', () => {
            const tabular = buildChartCsvTabular(SCATTER_CHART);
            expect(tabular?.source).toBe('scatter');
            expect(tabular?.rows).toHaveLength(2);
            expect(tabular?.rows[0]).toMatchObject({
                series: 'Our Brand',
                attribute: 'Taste',
                x: 0.8,
                y: 72,
                n: 120,
            });
        });

        it('produces CSV with Series, X, Y, N columns', () => {
            const built = buildChartCsvContent(SCATTER_CHART);
            expect(built).not.toBeNull();
            expectExportableCsv(built!.content, {
                minDataRows: 2,
                headers: ['Series', 'Attribute', 'X', 'Y', 'N'],
                sampleValues: ['Our Brand', 'Taste', 0.8, 72],
            });
        });

        it('routes scatter before labels/datasets in pipeline', () => {
            const mixed = {
                ...SCATTER_CHART,
                data: {
                    labels: ['ignored'],
                    ...(SCATTER_CHART.data as Record<string, unknown>),
                },
            };
            const tabular = buildChartCsvTabular(mixed);
            expect(tabular?.source).toBe('scatter');
        });
    });

    describe('word cloud chart', () => {
        it('exports word frequency rows with brand', () => {
            const tabular = buildChartCsvTabular(WORD_CLOUD_CHART);
            expect(tabular?.source).toBe('wordcloud');
            expect(tabular?.rows).toHaveLength(2);
            expect(tabular?.rows[0]).toMatchObject({
                text: 'crispy',
                value: 24,
                brand: 'Abu Auf',
            });
        });

        it('produces CSV with Word, Count, Brand headers', () => {
            const built = buildChartCsvContent(WORD_CLOUD_CHART);
            expect(built).not.toBeNull();
            expectExportableCsv(built!.content, {
                minDataRows: 2,
                headers: ['Word', 'Count', 'Brand'],
                sampleValues: ['crispy', 24, 'Abu Auf'],
            });
            expect(csvDataRowCount(built!.content)).toBe(2);
            expect(csvHeadersInclude(built!.content, 'Word', 'Count', 'Brand')).toBe(true);
        });

        it('exports successfully from open-end cloud payload', () => {
            const result = exportChartCsv(WORD_CLOUD_CHART);
            expect(result.status).toBe('exported');
            expect(result.source).toBe('wordcloud');
            expect(result.rowCount).toBe(2);
        });
    });

    describe('brand strategic comparison chart', () => {
        it('builds fixed wide CSV columns for two brands at N=10', () => {
            const tabular = buildChartCsvTabular(BRAND_STRATEGIC_COMPARISON_CHART);
            expect(tabular?.source).toBe('brand_comparison');
            expect(tabular?.rows).toHaveLength(2);
            expect(tabular?.rows[0]).toMatchObject({
                label: 'Friday',
                purchase_intent: 90,
                overall_likability: 5,
            });
            expect(tabular?.rows[1]).toMatchObject({
                label: 'Squizz',
                purchase_intent: 100,
                overall_likability: 6,
            });
        });

        it('produces CSV with Label, Purchase Intent (T2B%), Overall Likability headers', () => {
            const built = buildChartCsvContent(BRAND_STRATEGIC_COMPARISON_CHART);
            expect(built).not.toBeNull();
            expectExportableCsv(built!.content, {
                minDataRows: 2,
                headers: ['Label', 'Purchase Intent (T2B%)', 'Overall Likability'],
                sampleValues: ['Friday', 90, 5],
            });
        });

        it('routes before profileToRows when profile and metrics are present', () => {
            const tabular = buildChartCsvTabular(BRAND_STRATEGIC_COMPARISON_WITH_PROFILE);
            expect(tabular?.source).toBe('brand_comparison');
            expect(tabular?.columns.map((c) => c.header)).toEqual([
                'Label',
                'Purchase Intent (T2B%)',
                'Overall Likability',
            ]);
        });

        it('resolves alternate PI dataset labels and ratio values', () => {
            const tabular = buildChartCsvTabular(BRAND_STRATEGIC_COMPARISON_ALT_LABELS);
            expect(tabular?.rows[0]?.purchase_intent).toBe(90);
            expect(tabular?.rows[1]?.purchase_intent).toBe(100);
        });

        it('exports successfully with brand_comparison source', () => {
            const result = exportChartCsv(BRAND_STRATEGIC_COMPARISON_CHART);
            expect(result.status).toBe('exported');
            expect(result.source).toBe('brand_comparison');
            expect(result.rowCount).toBe(2);
        });
    });

    describe('empty and unsupported charts', () => {
        it('empty table: assesses as empty and blocks export', () => {
            const assessment = assessChartCsvExport(EMPTY_TABLE_CHART);
            expect(assessment.canExport).toBe(false);
            expect(assessment.status).toBe('empty');
            expect(assessment.reason).toMatch(/no exportable/i);

            const result = exportChartCsv(EMPTY_TABLE_CHART);
            expect(result.status).toBe('empty');
            expect(exportUtils.downloadFile).not.toHaveBeenCalled();
        });

        it('unsupported shape: empty data object', () => {
            const assessment = assessChartCsvExport(UNSUPPORTED_CHART);
            expect(assessment.canExport).toBe(false);
            expect(assessment.status).toBe('unsupported');

            const result = exportChartCsv(UNSUPPORTED_CHART);
            expect(result.status).toBe('unsupported');
            expect(buildChartCsvContent(UNSUPPORTED_CHART)).toBeNull();
        });

        it('narrative-only data is unsupported (no AI text export)', () => {
            const assessment = assessChartCsvExport(NARRATIVE_ONLY_CHART);
            expect(assessment.canExport).toBe(false);
            expect(assessment.status).toBe('unsupported');

            const built = buildChartCsvContent(NARRATIVE_ONLY_CHART);
            expect(built).toBeNull();
        });

        it('missing chart identity is unsupported', () => {
            const result = exportChartCsv({ chart_id: '', title: '', data: { labels: ['A'], datasets: [] } });
            expect(result.status).toBe('unsupported');
            expect(result.reason).toMatch(/id or title/i);
        });
    });
});
