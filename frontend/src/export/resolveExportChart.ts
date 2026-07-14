export function resolveExportChart(report: { charts?: unknown[] } | null | undefined, chartId: string) {
  const charts = Array.isArray(report?.charts) ? report.charts : [];
  return charts.find((chart) => {
    if (!chart || typeof chart !== 'object') {
      return false;
    }
    return String((chart as { chart_id?: string }).chart_id || '') === chartId;
  }) ?? null;
}
