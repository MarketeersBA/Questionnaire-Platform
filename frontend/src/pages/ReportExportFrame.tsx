import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { analytics } from '../services/api';
import { ChartRenderer } from '../components/report/ChartRenderer';
import { ThemeProvider } from '../context/ThemeContext';
import { ExportFrameShell } from '../export/ExportFrameShell';
import { EXPORT_CAPTURE_DEFAULTS, resolveExportFrameDimensions } from '../export/captureDefaults';
import { markExportError } from '../export/exportReadyGlobal';
import {
  isReportAuthMissing,
  reportAuthMissingError,
  resolveExportReportLoadError,
} from '../export/reportLoadErrors';
import { parseExportFrameQuery } from '../export/queryParams';
import { resolveExportChart } from '../export/resolveExportChart';
import type { ExportReadyMeta } from '../export/types';
import { useExportReadySignal } from '../export/useExportReadySignal';

type LoadState = 'loading' | 'ready' | 'error';

export default function ReportExportFrame() {
  const { surveyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const query = useMemo(() => parseExportFrameQuery(searchParams), [searchParams]);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('missing_chart_id');
  const [chart, setChart] = useState<Record<string, unknown> | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const frameDimensions = useMemo(
    () => resolveExportFrameDimensions(query?.frame ?? 'chart_body'),
    [query?.frame],
  );

  useEffect(() => {
    if (!query) {
      setLoadState('error');
      setErrorMessage('missing_chart_id');
      markExportError('missing_chart_id');
      return;
    }

    let cancelled = false;

    const loadReport = async () => {
      setLoadState('loading');
      setChart(null);
      setRenderError(null);

      if (isReportAuthMissing()) {
        const missing = reportAuthMissingError();
        if (!cancelled) {
          setLoadState('error');
          setErrorMessage(missing.code);
          markExportError(missing.code);
        }
        return;
      }

      try {
        const report = await analytics.getReport(surveyId, { exportFrame: true });
        const resolvedChart = resolveExportChart(report, query.chartId);
        if (!resolvedChart) {
          if (!cancelled) {
            setLoadState('error');
            setErrorMessage('chart_not_found');
            markExportError('chart_not_found');
          }
          return;
        }

        if (!cancelled) {
          setChart(resolvedChart as Record<string, unknown>);
          setLoadState('ready');
        }
      } catch (error) {
        if (!cancelled) {
          const { code } = resolveExportReportLoadError(error);
          setLoadState('error');
          setErrorMessage(code);
          markExportError(code);
        }
      }
    };

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [query, surveyId]);

  const readyMeta: ExportReadyMeta | null = useMemo(() => {
    if (!query || !chart || loadState !== 'ready') {
      return null;
    }

    return {
      surveyId,
      chartId: query.chartId,
      chartType: String(chart.chart_type || 'table'),
      theme: query.theme,
      frame: query.frame,
      width: frameDimensions.width,
      height: frameDimensions.height,
      readyAt: new Date().toISOString(),
    };
  }, [chart, frameDimensions.height, frameDimensions.width, loadState, query, surveyId]);

  const isReady = useExportReadySignal({
    enabled: loadState === 'ready' && Boolean(chart) && !renderError,
    meta: readyMeta,
    hasRenderError: Boolean(renderError),
  });

  if (!query) {
    return (
      <ExportStatusSurface
        message="missing_chart_id"
        width={EXPORT_CAPTURE_DEFAULTS.viewportWidthPx}
        height={EXPORT_CAPTURE_DEFAULTS.viewportHeightPx}
      />
    );
  }

  if (loadState === 'loading') {
    return (
      <ExportStatusSurface
        message="loading"
        width={frameDimensions.width}
        height={frameDimensions.height}
      />
    );
  }

  if (loadState === 'error' || !chart) {
    return (
      <ExportStatusSurface
        message={errorMessage}
        width={frameDimensions.width}
        height={frameDimensions.height}
      />
    );
  }

  return (
    <ThemeProvider forcedTheme={query.theme}>
      <div
        className="export-frame-page"
        style={{
          width: `${frameDimensions.width}px`,
          height: `${frameDimensions.height}px`,
          overflow: 'hidden',
          margin: 0,
          padding: 0,
        }}
      >
        <ExportFrameShell
          theme={query.theme}
          frame={query.frame}
          width={frameDimensions.width}
          height={frameDimensions.height}
          isReady={isReady}
          chartId={query.chartId}
        >
          <ChartRenderer
            chart={chart}
            exportMode
            exportOptions={{
              width: frameDimensions.width,
              height: frameDimensions.height,
              includeTitle: EXPORT_CAPTURE_DEFAULTS.includeTitle,
              includeAiHeadline: EXPORT_CAPTURE_DEFAULTS.includeAiHeadline,
              includeFootnotes: EXPORT_CAPTURE_DEFAULTS.includeFootnotes,
              includeAiDeepAnalysis: EXPORT_CAPTURE_DEFAULTS.includeAiDeepAnalysis,
            }}
            onExportRenderError={setRenderError}
          />
        </ExportFrameShell>
      </div>
    </ThemeProvider>
  );
}

function ExportStatusSurface({
  message,
  width,
  height,
}: {
  message: string;
  width: number;
  height: number;
}) {
  return (
    <div
      data-export-ready="false"
      data-export-error={message}
      className="export-frame-status"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        color: '#0f172a',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '12px',
      }}
    >
      {message}
    </div>
  );
}
