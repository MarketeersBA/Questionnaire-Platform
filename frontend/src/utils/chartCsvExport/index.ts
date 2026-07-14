/**
 * Chart CSV export — shape-based converters → tabular rows → CSV download.
 *
 * Safety: read-only chart snapshots, no narrative fields, numeric preservation,
 * and all CSV escaping delegated to exportUtils.generateCSV().
 */

import { downloadFile } from '../exportUtils';
import { buildChartCsvContent } from './buildContent';
import { assessChartCsvExport } from './exportability';
import { chartCsvFilename } from './filename';
import { resolveChartCsvTabular } from './pipeline';
import { snapshotChartForExport } from './safety';
import type {
    ChartCsvExportResult,
    ChartCsvTabular,
    ChartPayloadLike,
} from './types';

export type {
    ChartCsvExportResult,
    ChartCsvExportStatus,
    ChartCsvSource,
    ChartCsvTabular,
    ChartPayloadLike,
    CsvColumnDef,
} from './types';

export type { ChartCsvExportability, ChartCsvExportabilityStatus } from './exportability';
export { assessChartCsvExport } from './exportability';
export { chartCsvFilename } from './filename';
export { SHAPE_CONVERTER_PIPELINE, resolveChartCsvTabular } from './pipeline';
export {
    NARRATIVE_DATA_KEYS,
    coerceExportCell,
    finalizeTabular,
    snapshotChartForExport,
} from './safety';

export { brandComparisonToRows } from './converters/brandComparison';
export { labelsDatasetsToRows } from './converters/labelsDatasets';
export { tableToRows } from './converters/table';
export { scatterToRows } from './converters/scatter';
export { heatmapToRows } from './converters/heatmap';
export { wordCloudToRows } from './converters/wordCloud';
export { profileToRows } from './converters/profile';
export { flattenRecords } from './converters/flatten';

export const buildChartCsvTabular = (chart: ChartPayloadLike): ChartCsvTabular | null =>
    resolveChartCsvTabular(snapshotChartForExport(chart));

export { buildChartCsvContent } from './buildContent';

export const exportChartCsv = (chart: ChartPayloadLike): ChartCsvExportResult => {
    const snapshot = snapshotChartForExport(chart);
    const assessment = assessChartCsvExport(snapshot);

    if (!assessment.canExport) {
        return {
            status: assessment.exportStatus ?? (assessment.status === 'empty' ? 'empty' : 'unsupported'),
            reason: assessment.reason,
            source: assessment.source,
        };
    }

    const built = buildChartCsvContent(snapshot);
    if (!built) {
        return {
            status: 'empty',
            reason: assessment.reason ?? 'Chart has no exportable rows',
        };
    }

    const filename = chartCsvFilename(snapshot);
    // Escaping is handled exclusively by generateCSV() inside buildChartCsvContent
    downloadFile(built.content, filename, 'text/csv;charset=utf-8;');

    return {
        status: 'exported',
        filename,
        rowCount: built.tabular.rows.length,
        source: built.tabular.source,
    };
};
