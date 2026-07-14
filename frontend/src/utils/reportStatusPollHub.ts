import { analytics, type ReportPptxStatus } from '../services/api';

export type StatusWatchMode = 'report' | 'pptx' | 'both';

export type PollErrorKind = 'rate_limited' | 'network' | 'unknown';

export type PollSubscriber = {
  id: string;
  watch: StatusWatchMode;
  enabled: boolean;
  onUpdate: (status: ReportPptxStatus) => void;
  onTerminal?: (status: ReportPptxStatus, reason: string) => void;
  /** Fired when a poll tick fails (after coalesced fetch). */
  onPollError?: (error: unknown, kind: PollErrorKind) => void;
  /** Fired when the server returns 429 / hub backs off. */
  onRateLimited?: (retryAfterMs: number) => void;
  /** Fired when pptx_stale is true on a status payload. */
  onStale?: (status: ReportPptxStatus) => void;
  /**
   * Fired on progress heartbeats even when the terminal fingerprint is unchanged
   * (elapsed time, chart index, stage detail, idle seconds).
   */
  onHeartbeat?: (status: ReportPptxStatus) => void;
};

type PollResult = {
  data: ReportPptxStatus;
  pollIntervalMs: number;
};

const MIN_INTERVAL_MS = 2500;
const MAX_INTERVAL_MS = 15000;
const HIDDEN_INTERVAL_MS = 12000;
const CONNECTION_UNSTABLE_THRESHOLD = 3;

const inflight = new Map<string, Promise<PollResult>>();
const subscribers = new Map<string, Map<string, PollSubscriber>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const lastPayload = new Map<string, string>();
const lastHeartbeat = new Map<string, string>();
const consecutiveErrors = new Map<string, number>();
const rateLimitedUntil = new Map<string, number>();

function jitter(ms: number): number {
  const spread = Math.min(400, ms * 0.12);
  return Math.round(ms + (Math.random() * spread * 2 - spread));
}

function resolveIntervalMs(data: ReportPptxStatus, retryAfterSec?: number): number {
  if (retryAfterSec && retryAfterSec > 0) {
    return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, retryAfterSec * 1000));
  }
  const serverSec = data.poll_interval_seconds;
  if (typeof serverSec === 'number' && serverSec > 0) {
    return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, serverSec * 1000));
  }
  return MIN_INTERVAL_MS;
}

/** Terminal / job-level fingerprint — drives onUpdate when job state changes. */
export function statusFingerprint(status: ReportPptxStatus): string {
  return JSON.stringify({
    status: status.status,
    pptx_status: status.pptx_status,
    pptx_progress: status.pptx_progress,
    pptx_stage: status.pptx_stage,
    pptx_stale: status.pptx_stale,
    pptx_retryable: status.pptx_retryable,
    pptx_cancel_requested: status.pptx_cancel_requested,
    error: status.error,
    pptx_error: status.pptx_error,
    user_message: status.user_message,
  });
}

/** Heartbeat fingerprint — progress fields that change without terminal transitions. */
export function heartbeatFingerprint(status: ReportPptxStatus): string {
  return JSON.stringify({
    pptx_progress: status.pptx_progress,
    pptx_stage: status.pptx_stage,
    pptx_stage_detail: status.pptx_stage_detail,
    pptx_capture_total: status.pptx_capture_total,
    pptx_capture_completed: status.pptx_capture_completed,
    pptx_current_chart_id: status.pptx_current_chart_id,
    pptx_current_chart_title: status.pptx_current_chart_title,
    pptx_elapsed_seconds: status.pptx_elapsed_seconds,
    pptx_idle_seconds: status.pptx_idle_seconds,
    pptx_stale: status.pptx_stale,
    user_message: status.user_message,
  });
}

function terminalReason(
  status: ReportPptxStatus,
  watch: StatusWatchMode,
): string | null {
  if (watch === 'report' || watch === 'both') {
    if (status.status === 'ready') return 'report_ready';
    if (status.status === 'failed') return 'report_failed';
  }
  if (watch === 'pptx' || watch === 'both') {
    if (status.pptx_status === 'READY') return 'pptx_ready';
    if (status.pptx_status === 'FAILED') return 'pptx_failed';
    if (status.pptx_status === 'CANCELLED') return 'pptx_cancelled';
    if (status.pptx_status === 'QUEUED' || status.pptx_status === 'PROCESSING') {
      return null;
    }
  }
  return null;
}

function anySubscriberActive(surveyId: string): boolean {
  const subs = subscribers.get(surveyId);
  if (!subs?.size) return false;
  return [...subs.values()].some((s) => s.enabled);
}

function needsPolling(surveyId: string, status: ReportPptxStatus): boolean {
  const subs = subscribers.get(surveyId);
  if (!subs?.size) return false;

  for (const sub of subs.values()) {
    if (!sub.enabled) continue;
    const terminal = terminalReason(status, sub.watch);
    if (!terminal) return true;
  }
  return false;
}

function classifyPollError(err: unknown): PollErrorKind {
  if (err instanceof Error && err.message === 'RATE_LIMITED') {
    return 'rate_limited';
  }
  const axiosErr = err as { response?: { status?: number }; code?: string };
  if (!axiosErr.response) {
    return 'network';
  }
  if (axiosErr.response.status === 429) {
    return 'rate_limited';
  }
  return 'unknown';
}

async function fetchCoalesced(
  surveyId: string,
  retryAfterSec?: number,
): Promise<PollResult> {
  const existing = inflight.get(surveyId);
  if (existing) return existing;

  const promise = (async (): Promise<PollResult> => {
    try {
      const { data, pollIntervalMs } = await analytics.getReportStatus(surveyId);
      consecutiveErrors.set(surveyId, 0);
      rateLimitedUntil.delete(surveyId);
      return {
        data,
        pollIntervalMs: pollIntervalMs ?? resolveIntervalMs(data, retryAfterSec),
      };
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; headers?: Record<string, string> };
      };
      if (axiosErr.response?.status === 429) {
        const retryHeader =
          axiosErr.response.headers?.['retry-after'] ??
          axiosErr.response.headers?.['Retry-After'];
        const retrySec = retryHeader ? Number(retryHeader) : 30;
        const retryMs = resolveIntervalMs(
          { survey_id: surveyId } as ReportPptxStatus,
          Number.isFinite(retrySec) ? retrySec : 30,
        );
        rateLimitedUntil.set(surveyId, Date.now() + retryMs);
        const rateErr = new Error('RATE_LIMITED') as Error & { retryAfterMs: number };
        rateErr.retryAfterMs = retryMs;
        throw rateErr;
      }
      throw err;
    } finally {
      inflight.delete(surveyId);
    }
  })();

  inflight.set(surveyId, promise);
  return promise;
}

function dispatchToSubscribers(
  surveyId: string,
  status: ReportPptxStatus,
  opts: {
    payloadChanged: boolean;
    heartbeatChanged: boolean;
  },
) {
  const subs = subscribers.get(surveyId);
  if (!subs) return;

  for (const sub of subs.values()) {
    if (!sub.enabled) continue;

    if (opts.payloadChanged) {
      sub.onUpdate(status);
      const reason = terminalReason(status, sub.watch);
      if (reason) {
        sub.onTerminal?.(status, reason);
      }
    } else if (opts.heartbeatChanged) {
      sub.onHeartbeat?.(status);
    }

    if (status.pptx_stale) {
      sub.onStale?.(status);
    }
  }
}

function notify(surveyId: string, status: ReportPptxStatus) {
  const fp = statusFingerprint(status);
  const hb = heartbeatFingerprint(status);
  const prev = lastPayload.get(surveyId);
  const prevHb = lastHeartbeat.get(surveyId);

  const payloadChanged = prev !== fp;
  const heartbeatChanged = prevHb !== hb;

  if (!payloadChanged && !heartbeatChanged) {
    return;
  }

  if (payloadChanged) {
    lastPayload.set(surveyId, fp);
  }
  if (heartbeatChanged) {
    lastHeartbeat.set(surveyId, hb);
  }

  dispatchToSubscribers(surveyId, status, { payloadChanged, heartbeatChanged });
}

function notifyPollError(surveyId: string, err: unknown) {
  const kind = classifyPollError(err);
  const subs = subscribers.get(surveyId);
  if (!subs) return;

  for (const sub of subs.values()) {
    if (!sub.enabled) continue;
    sub.onPollError?.(err, kind);
  }
}

function notifyRateLimited(surveyId: string, retryAfterMs: number) {
  const subs = subscribers.get(surveyId);
  if (!subs) return;

  for (const sub of subs.values()) {
    if (!sub.enabled) continue;
    sub.onRateLimited?.(retryAfterMs);
  }
}

function schedule(surveyId: string, delayMs: number) {
  const prev = timers.get(surveyId);
  if (prev) clearTimeout(prev);

  const hidden = typeof document !== 'undefined' && document.hidden;
  const effective = hidden ? Math.max(delayMs, HIDDEN_INTERVAL_MS) : delayMs;

  timers.set(
    surveyId,
    setTimeout(() => void tick(surveyId), jitter(effective)),
  );
}

async function tick(surveyId: string) {
  if (!anySubscriberActive(surveyId)) {
    stopHub(surveyId);
    return;
  }

  let nextMs = MIN_INTERVAL_MS;
  try {
    const { data, pollIntervalMs } = await fetchCoalesced(surveyId);
    notify(surveyId, data);
    nextMs = pollIntervalMs;

    if (!needsPolling(surveyId, data)) {
      stopHub(surveyId);
      return;
    }
  } catch (err: unknown) {
    const prevErrors = consecutiveErrors.get(surveyId) ?? 0;
    consecutiveErrors.set(surveyId, prevErrors + 1);
    notifyPollError(surveyId, err);

    const rateLimited =
      err instanceof Error &&
      err.message === 'RATE_LIMITED' &&
      'retryAfterMs' in err;
    if (rateLimited) {
      const retryMs = (err as Error & { retryAfterMs: number }).retryAfterMs;
      notifyRateLimited(surveyId, retryMs);
      nextMs = retryMs;
    } else {
      nextMs = Math.min(nextMs * 1.5, MAX_INTERVAL_MS);
      if ((consecutiveErrors.get(surveyId) ?? 0) >= CONNECTION_UNSTABLE_THRESHOLD) {
        nextMs = Math.min(MAX_INTERVAL_MS, nextMs * 1.2);
      }
    }
  }

  if (anySubscriberActive(surveyId)) {
    schedule(surveyId, nextMs);
  }
}

function stopHub(surveyId: string) {
  const t = timers.get(surveyId);
  if (t) clearTimeout(t);
  timers.delete(surveyId);
}

export function getPollHubErrorCount(surveyId: string): number {
  return consecutiveErrors.get(surveyId) ?? 0;
}

export function isPollHubRateLimited(surveyId: string): boolean {
  const until = rateLimitedUntil.get(surveyId);
  return typeof until === 'number' && until > Date.now();
}

export function subscribeReportStatusPoll(
  surveyId: string,
  subscriber: PollSubscriber,
): () => void {
  if (!subscribers.has(surveyId)) {
    subscribers.set(surveyId, new Map());
  }
  subscribers.get(surveyId)!.set(subscriber.id, subscriber);

  if (subscriber.enabled && !timers.has(surveyId)) {
    void tick(surveyId);
  }

  return () => {
    const subs = subscribers.get(surveyId);
    subs?.delete(subscriber.id);
    if (subs?.size === 0) {
      subscribers.delete(surveyId);
      stopHub(surveyId);
      lastPayload.delete(surveyId);
      lastHeartbeat.delete(surveyId);
      consecutiveErrors.delete(surveyId);
      rateLimitedUntil.delete(surveyId);
    }
  };
}

export function setReportStatusPollEnabled(
  surveyId: string,
  subscriberId: string,
  enabled: boolean,
) {
  const subs = subscribers.get(surveyId);
  const sub = subs?.get(subscriberId);
  if (!sub) return;
  sub.enabled = enabled;
  if (enabled && !timers.has(surveyId)) {
    void tick(surveyId);
  } else if (!anySubscriberActive(surveyId)) {
    stopHub(surveyId);
  }
}

/** One-shot status read (modal open sync) — shares inflight with the hub. */
export async function fetchReportStatusOnce(
  surveyId: string,
): Promise<ReportPptxStatus> {
  const { data } = await fetchCoalesced(surveyId);
  lastPayload.set(surveyId, statusFingerprint(data));
  lastHeartbeat.set(surveyId, heartbeatFingerprint(data));
  return data;
}

/** Test-only: clear module state between vitest cases. */
export function resetReportStatusPollHubForTests(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
  subscribers.clear();
  inflight.clear();
  lastPayload.clear();
  lastHeartbeat.clear();
  consecutiveErrors.clear();
  rateLimitedUntil.clear();
}
