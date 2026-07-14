import type { PptxExportErrorPayload, ReportPptxStatus } from '../../services/api';

export type PptxExportStageKey =
  | 'preparing'
  | 'capturing_charts'
  | 'assembling_deck'
  | 'validating'
  | 'ready'
  | 'failed'
  | 'queued'
  | 'cancelled'
  | 'unknown';

export type PptxDegradedState =
  | 'none'
  | 'taking_longer'
  | 'stale'
  | 'interrupted'
  | 'retry_available'
  | 'rate_limited'
  | 'connection_unstable';

export interface PptxStagePresentation {
  key: PptxExportStageKey;
  title: string;
  detail: string;
  footer: string;
  captureHeavy: boolean;
}

export interface PptxFailurePresentation {
  headline: string;
  summary: string;
  stageLabel: string;
  reasons: string[];
  warnings: string[];
  errorCode?: string;
  retryGuidance?: string;
  retryable?: boolean;
}

export interface PptxDegradedPresentation {
  state: PptxDegradedState;
  title: string;
  detail: string;
  tone: 'amber' | 'red' | 'blue' | 'slate';
}

export interface PptxProgressSnapshot {
  elapsedLabel: string | null;
  chartLine: string | null;
  stageDetail: string | null;
  idleSeconds: number | null;
}

const STAGE_PRESENTATION: Record<PptxExportStageKey, PptxStagePresentation> = {
  preparing: {
    key: 'preparing',
    title: 'Preparing export',
    detail: 'Normalizing report data and planning slide order.',
    footer: 'Preparing report payload',
    captureHeavy: false,
  },
  queued: {
    key: 'queued',
    title: 'Queued for export',
    detail: 'Your job is waiting for the PPTX worker. It should start within a minute.',
    footer: 'Waiting for worker',
    captureHeavy: false,
  },
  capturing_charts: {
    key: 'capturing_charts',
    title: 'Capturing charts',
    detail: 'Rendering each chart in the report export frame and saving PNG artifacts.',
    footer: 'Browser capture in progress',
    captureHeavy: true,
  },
  assembling_deck: {
    key: 'assembling_deck',
    title: 'Assembling deck',
    detail: 'Placing narrative slides, captured chart images, and native chart slides.',
    footer: 'Building PowerPoint slides',
    captureHeavy: false,
  },
  validating: {
    key: 'validating',
    title: 'Running quality checks',
    detail: 'Auditing slide content, capture metadata, and export validation gates.',
    footer: 'Certifying export integrity',
    captureHeavy: false,
  },
  ready: {
    key: 'ready',
    title: 'Presentation ready',
    detail: 'Your executive deck passed validation and is ready to download.',
    footer: 'Artifact status: ready',
    captureHeavy: false,
  },
  failed: {
    key: 'failed',
    title: 'Export failed',
    detail: 'The export job stopped before a downloadable deck was certified.',
    footer: 'Export blocked',
    captureHeavy: false,
  },
  cancelled: {
    key: 'cancelled',
    title: 'Export cancelled',
    detail: 'The export was stopped. You can start a new export when ready.',
    footer: 'Export cancelled',
    captureHeavy: false,
  },
  unknown: {
    key: 'unknown',
    title: 'Building presentation',
    detail: 'Waiting for the next export stage update from the server.',
    footer: 'Export in progress',
    captureHeavy: false,
  },
};

const STAGE_LABELS: Record<string, string> = {
  preparing: 'Preparation',
  capturing_charts: 'Chart capture',
  assembling_deck: 'Deck assembly',
  validating: 'Validation',
  ready: 'Ready',
  failed: 'Failed',
  queued: 'Queued',
  cancelled: 'Cancelled',
  engine: 'Deck assembly',
  validation: 'Validation',
  storage: 'Storage',
  rebuild: 'Rebuild',
};

const FAILURE_CODE_COPY: Record<string, { headline: string; summary?: string }> = {
  capture_timeout: {
    headline: 'Chart capture timed out',
    summary: 'One or more charts took too long to render in the export frame.',
  },
  export_timeout: {
    headline: 'Export timed out',
    summary: 'The server stopped the job after exceeding the configured time limit.',
  },
  frontend_not_ready: {
    headline: 'Export frame not ready',
    summary: 'The chart page did not signal readiness. Refresh the report and retry.',
  },
  auth_missing: {
    headline: 'Capture authentication missing',
    summary: 'Server token for browser capture is missing or invalid.',
  },
  worker_interrupted_or_stale: {
    headline: 'Export interrupted',
    summary: 'The job lost progress—often after a restart or long stall without heartbeats.',
  },
  validation_failed: {
    headline: 'Validation failed',
  },
  storage_error: {
    headline: 'Could not save presentation',
  },
  cancelled: {
    headline: 'Export cancelled',
  },
};

/** Elapsed seconds before "taking longer" during chart capture. */
export const CAPTURE_LONG_RUNNING_SEC = 120;
/** Elapsed seconds before "taking longer" for non-capture stages. */
export const EXPORT_LONG_RUNNING_SEC = 300;
/** Idle seconds on same chart before capture stall copy. */
export const CAPTURE_IDLE_STALL_SEC = 90;

export const EXPORT_PROFILE = {
  templateLabel: 'Marketeers executive template',
  templateDetail: 'Fixed server-side deck chrome and narrative layout.',
  themeLabel: 'Light theme, 16:9 chart body',
  themeDetail: 'Hybrid exports capture charts from the report export frame.',
  rolloutNote: 'Server rollout stage and render mode are reported during export polling.',
  note: 'Template, theme, and branding overrides are not configurable in this release.',
} as const;

export function normalizePptxStage(stage?: string | null): PptxExportStageKey {
  const normalized = String(stage || '').trim().toLowerCase();
  if (normalized in STAGE_PRESENTATION) {
    return normalized as PptxExportStageKey;
  }
  return 'unknown';
}

export function formatElapsedDuration(totalSeconds?: number | null): string | null {
  const sec = Number(totalSeconds);
  if (!Number.isFinite(sec) || sec < 0) {
    return null;
  }
  if (sec < 60) {
    return `${Math.round(sec)}s`;
  }
  const minutes = Math.floor(sec / 60);
  const remainder = Math.round(sec % 60);
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function formatCaptureProgressLine(status: ReportPptxStatus): string | null {
  const total = status.pptx_capture_total;
  const completed = status.pptx_capture_completed;
  if (typeof total !== 'number' || total <= 0) {
    return null;
  }
  const done = typeof completed === 'number' ? completed : 0;
  const title = status.pptx_current_chart_title || status.pptx_current_chart_id;
  if (title) {
    return `Chart ${Math.min(done + 1, total)} of ${total} — ${title}`;
  }
  return `Chart ${done} of ${total} captured`;
}

export function buildPptxProgressSnapshot(status: ReportPptxStatus): PptxProgressSnapshot {
  return {
    elapsedLabel: formatElapsedDuration(status.pptx_elapsed_seconds),
    chartLine: formatCaptureProgressLine(status),
    stageDetail:
      status.pptx_stage_detail?.trim() ||
      status.user_message?.trim() ||
      null,
    idleSeconds:
      typeof status.pptx_idle_seconds === 'number' ? status.pptx_idle_seconds : null,
  };
}

export function getPptxStagePresentation(
  stage?: string | null,
  status?: ReportPptxStatus | null,
): PptxStagePresentation {
  const base = STAGE_PRESENTATION[normalizePptxStage(stage)];
  if (!status) {
    return base;
  }

  const snapshot = buildPptxProgressSnapshot(status);
  const stageKey = normalizePptxStage(stage);

  if (stageKey === 'capturing_charts') {
    const idle = snapshot.idleSeconds;
    if (idle != null && idle >= CAPTURE_IDLE_STALL_SEC) {
      return {
        ...base,
        detail:
          snapshot.stageDetail ||
          `Still capturing charts — no progress for ${formatElapsedDuration(idle)}. ` +
            'Large reports can take several minutes; the worker is still running.',
      };
    }
    if (snapshot.chartLine) {
      return {
        ...base,
        detail: snapshot.stageDetail || snapshot.chartLine,
        footer: snapshot.chartLine,
      };
    }
  }

  if (snapshot.stageDetail && stageKey !== 'ready' && stageKey !== 'failed') {
    return {
      ...base,
      detail: snapshot.stageDetail,
    };
  }

  return base;
}

export function getPptxStageLabel(stage?: string | null): string {
  const normalized = String(stage || '').trim().toLowerCase();
  return STAGE_LABELS[normalized] || 'Export';
}

export type ResolveDegradedOptions = {
  rateLimited?: boolean;
  connectionUnstable?: boolean;
  consecutivePollErrors?: number;
};

export function resolvePptxDegradedState(
  status: ReportPptxStatus,
  options: ResolveDegradedOptions = {},
): PptxDegradedState {
  if (options.rateLimited) {
    return 'rate_limited';
  }
  if (options.connectionUnstable || (options.consecutivePollErrors ?? 0) >= 3) {
    return 'connection_unstable';
  }

  const pptxStatus = String(status.pptx_status || '').toUpperCase();

  if (pptxStatus === 'FAILED') {
    const code = status.pptx_error?.code;
    if (
      code === 'worker_interrupted_or_stale' ||
      status.pptx_stale ||
      code === 'capture_timeout' ||
      code === 'export_timeout'
    ) {
      return 'interrupted';
    }
    if (status.pptx_retryable !== false) {
      return 'retry_available';
    }
    return 'none';
  }

  if (pptxStatus === 'CANCELLED') {
    return 'retry_available';
  }

  if (pptxStatus !== 'PROCESSING' && pptxStatus !== 'QUEUED') {
    return 'none';
  }

  if (status.pptx_stale) {
    return 'stale';
  }

  const stage = normalizePptxStage(status.pptx_stage);
  const elapsed = Number(status.pptx_elapsed_seconds);
  const idle = Number(status.pptx_idle_seconds);

  if (stage === 'capturing_charts') {
    if (
      (Number.isFinite(idle) && idle >= CAPTURE_IDLE_STALL_SEC) ||
      (Number.isFinite(elapsed) && elapsed >= CAPTURE_LONG_RUNNING_SEC)
    ) {
      return 'taking_longer';
    }
    return 'none';
  }

  if (Number.isFinite(elapsed) && elapsed >= EXPORT_LONG_RUNNING_SEC) {
    return 'taking_longer';
  }

  return 'none';
}

export function getPptxDegradedPresentation(state: PptxDegradedState): PptxDegradedPresentation | null {
  switch (state) {
    case 'taking_longer':
      return {
        state,
        title: 'Taking longer than expected',
        detail:
          'Large reports and chart capture can run for several minutes. Polling will continue automatically.',
        tone: 'amber',
      };
    case 'stale':
      return {
        state,
        title: 'Export may be stalled',
        detail:
          'No recent progress updates were received. You can close this dialog—the server may mark the job interrupted shortly.',
        tone: 'amber',
      };
    case 'interrupted':
      return {
        state,
        title: 'Export interrupted',
        detail:
          'The previous run stopped unexpectedly (timeout, restart, or worker loss). Retry when you are ready.',
        tone: 'red',
      };
    case 'retry_available':
      return {
        state,
        title: 'Retry available',
        detail: 'You can start a new export. An older file may still be downloadable if one exists.',
        tone: 'blue',
      };
    case 'rate_limited':
      return {
        state,
        title: 'Rate limited',
        detail: 'Status polling is temporarily throttled. Updates will resume automatically.',
        tone: 'amber',
      };
    case 'connection_unstable':
      return {
        state,
        title: 'Connection unstable',
        detail: 'Status checks are failing intermittently. Export may still be running on the server.',
        tone: 'amber',
      };
    default:
      return null;
  }
}

export function canCloseModalDuringExport(
  exportStatus: string,
  degraded: PptxDegradedState,
): boolean {
  if (exportStatus !== 'processing') {
    return true;
  }
  return (
    degraded === 'stale' ||
    degraded === 'interrupted' ||
    degraded === 'rate_limited' ||
    degraded === 'connection_unstable' ||
    degraded === 'taking_longer'
  );
}

export function shouldShowCancelExport(
  exportStatus: string,
  pptxStatus?: string,
): boolean {
  const normalized = String(pptxStatus || '').toUpperCase();
  return (
    exportStatus === 'processing' &&
    (normalized === 'PROCESSING' || normalized === 'QUEUED')
  );
}

function collectMessages(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function formatPptxErrorPayload(error?: PptxExportErrorPayload | null): PptxFailurePresentation | null {
  if (!error) {
    return null;
  }

  const code = String(error.code || '').trim();
  const codeCopy = FAILURE_CODE_COPY[code];
  const reasons = collectMessages(error.validation_errors);
  const warnings = collectMessages(error.validation_warnings);
  const summary =
    String(error.retry_guidance || '').trim() ||
    String(error.message || '').trim() ||
    codeCopy?.summary ||
    'PowerPoint export failed before certification.';

  return {
    headline: codeCopy?.headline || 'Export validation failed',
    summary,
    stageLabel: getPptxStageLabel(error.stage),
    reasons: reasons.length ? reasons : [String(error.message || summary)],
    warnings,
    errorCode: code || undefined,
    retryGuidance: error.retry_guidance,
    retryable: error.retryable !== false,
  };
}

export function formatPptxExportFailure(status: ReportPptxStatus): PptxFailurePresentation {
  const fromPptxError = formatPptxErrorPayload(status.pptx_error);
  if (fromPptxError) {
    if (!fromPptxError.reasons.length && status.error) {
      return {
        ...fromPptxError,
        reasons: [status.error],
      };
    }
    return fromPptxError;
  }

  const fallbackMessage =
    String(status.user_message || '').trim() ||
    String(status.error || '').trim() ||
    'PowerPoint assembly failed. Please retry.';

  return {
    headline: status.pptx_stale ? 'Export interrupted' : 'Export failed',
    summary: fallbackMessage,
    stageLabel: getPptxStageLabel(status.pptx_stage || 'failed'),
    reasons: [fallbackMessage],
    warnings: [],
    retryable: status.pptx_retryable !== false,
  };
}

export function mergePptxProgress(current: number, next?: number | null): number {
  const parsed = Number(next);
  if (!Number.isFinite(parsed)) {
    return current;
  }
  return Math.max(current, Math.min(100, Math.round(parsed)));
}
