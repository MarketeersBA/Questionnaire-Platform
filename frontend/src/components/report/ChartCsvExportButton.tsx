import React from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    assessChartCsvExport,
    exportChartCsv,
    type ChartCsvExportResult,
    type ChartPayloadLike,
} from '../../utils/chartCsvExport';

interface ChartCsvExportButtonProps {
    chart: ChartPayloadLike;
    className?: string;
}

const notifyExportResult = (result: ChartCsvExportResult, chartLabel: string) => {
    switch (result.status) {
        case 'exported':
            toast.success('CSV exported', {
                description: `${chartLabel}: ${result.rowCount ?? 0} row(s) → ${result.filename ?? 'download'}`,
            });
            break;
        case 'empty':
            toast.info('No data to export', {
                description: result.reason ?? `${chartLabel} has no exportable rows.`,
            });
            break;
        case 'unsupported':
            toast.error('CSV export unavailable', {
                description: result.reason ?? 'This chart shape is not supported yet.',
            });
            break;
        default:
            toast.error('Export failed', { description: 'Unexpected export status.' });
    }
};

/**
 * Per-chart CSV download control for report visualizations.
 * Disabled with an informative tooltip when data is empty or unsupported.
 * Hidden by parent when `exportMode` is active (PPTX / capture frames).
 */
export function ChartCsvExportButton({ chart, className = '' }: ChartCsvExportButtonProps) {
    const [busy, setBusy] = React.useState(false);

    const chartLabel = chart.title || chart.chart_id || 'Chart';

    const assessment = React.useMemo(
        () => assessChartCsvExport(chart),
        [chart, chart.chart_id, chart.title, chart.data]
    );

    const handleExport = React.useCallback(() => {
        if (busy || !assessment.canExport) return;

        setBusy(true);
        try {
            const result = exportChartCsv(chart);
            notifyExportResult(result, chartLabel);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Export failed unexpectedly.';
            toast.error('CSV export failed', { description: message });
        } finally {
            setBusy(false);
        }
    }, [assessment.canExport, busy, chart, chartLabel]);

    if (!chart.chart_id && !chart.title) {
        return null;
    }

    const disabled = busy || !assessment.canExport;
    const tooltip = assessment.canExport
        ? assessment.filename
            ? `Download ${assessment.filename} (${assessment.rowCount ?? 0} rows)`
            : 'Export chart data (CSV)'
        : assessment.reason ?? 'CSV export unavailable for this chart';

    return (
        <button
            type="button"
            onClick={handleExport}
            disabled={disabled}
            aria-label={
                assessment.canExport
                    ? `Export ${chartLabel} as CSV`
                    : `CSV export unavailable: ${assessment.reason ?? 'no exportable data'}`
            }
            aria-disabled={disabled}
            title={tooltip}
            data-chart-csv-export="true"
            data-export-ready={assessment.canExport ? 'true' : 'false'}
            className={[
                'inline-flex items-center gap-1.5 shrink-0',
                'text-[10px] font-black uppercase tracking-[0.2em]',
                'px-2.5 py-1 rounded-md transition-all duration-200',
                'border',
                assessment.canExport
                    ? 'border-line/80 dark:border-line/10 bg-slate-100/80 dark:bg-white/5 text-ink-muted hover:bg-primary/10 hover:border-primary/30 hover:text-primary-soft'
                    : 'border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] text-ink-subtle cursor-not-allowed',
                'disabled:opacity-60 disabled:pointer-events-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                className,
            ].join(' ')}
        >
            {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>CSV</span>
        </button>
    );
}
