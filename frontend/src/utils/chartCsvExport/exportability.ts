import { chartCsvFilename } from './filename';
import { resolveChartCsvTabular } from './pipeline';
import { buildChartCsvContent } from './buildContent';
import type { ChartCsvExportStatus, ChartCsvSource, ChartPayloadLike } from './types';
import { snapshotChartForExport } from './safety';

export type ChartCsvExportabilityStatus = 'ready' | 'empty' | 'unsupported';

export interface ChartCsvExportability {
    /** Whether the UI should allow download */
    canExport: boolean;
    status: ChartCsvExportabilityStatus;
    /** Maps to export result status when user attempts download */
    exportStatus?: ChartCsvExportStatus;
    reason?: string;
    rowCount?: number;
    filename?: string;
    source?: ChartCsvSource;
}

const EMPTY_REASON = 'This chart has no exportable data rows.';
const UNSUPPORTED_REASON = 'This chart data shape is not supported for CSV export.';
const IDENTITY_REASON = 'Chart is missing an id or title required for export.';

/**
 * Pre-flight check for CSV export — used to disable the button and show tooltips.
 * Does not trigger download or mutate chart payloads.
 */
export const assessChartCsvExport = (chart: ChartPayloadLike): ChartCsvExportability => {
  if (!chart?.chart_id && !chart?.title) {
    return {
      canExport: false,
      status: 'unsupported',
      exportStatus: 'unsupported',
      reason: IDENTITY_REASON,
    };
  }

  const snapshot = snapshotChartForExport(chart);
  const tabular = resolveChartCsvTabular(snapshot);

  if (!tabular || tabular.rows.length === 0) {
    return {
      canExport: false,
      status: tabular ? 'empty' : 'unsupported',
      exportStatus: tabular ? 'empty' : 'unsupported',
      reason: tabular ? EMPTY_REASON : UNSUPPORTED_REASON,
    };
  }

  const built = buildChartCsvContent(snapshot);
  if (!built) {
    return {
      canExport: false,
      status: 'empty',
      exportStatus: 'empty',
      reason: EMPTY_REASON,
    };
  }

  return {
    canExport: true,
    status: 'ready',
    rowCount: tabular.rows.length,
    filename: chartCsvFilename(snapshot),
    source: tabular.source,
  };
};
