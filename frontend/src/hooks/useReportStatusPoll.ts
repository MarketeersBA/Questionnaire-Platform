import { useEffect, useId, useRef } from 'react';
import type { ReportPptxStatus } from '../services/api';
import {
  subscribeReportStatusPoll,
  setReportStatusPollEnabled,
  type PollErrorKind,
  type StatusWatchMode,
} from '../utils/reportStatusPollHub';

export type UseReportStatusPollOptions = {
  surveyId: string | undefined;
  enabled: boolean;
  watch?: StatusWatchMode;
  onUpdate: (status: ReportPptxStatus) => void;
  onTerminal?: (status: ReportPptxStatus, reason: string) => void;
  onPollError?: (error: unknown, kind: PollErrorKind) => void;
  onRateLimited?: (retryAfterMs: number) => void;
  onStale?: (status: ReportPptxStatus) => void;
  /** Progress heartbeats when only elapsed/chart/stage detail changed. */
  onHeartbeat?: (status: ReportPptxStatus) => void;
};

/**
 * Adaptive, coalesced report-status polling.
 * One timer + one HTTP request per survey across all subscribers (page + modal).
 */
export function useReportStatusPoll({
  surveyId,
  enabled,
  watch = 'both',
  onUpdate,
  onTerminal,
  onPollError,
  onRateLimited,
  onStale,
  onHeartbeat,
}: UseReportStatusPollOptions): void {
  const subscriberId = useId();
  const onUpdateRef = useRef(onUpdate);
  const onTerminalRef = useRef(onTerminal);
  const onPollErrorRef = useRef(onPollError);
  const onRateLimitedRef = useRef(onRateLimited);
  const onStaleRef = useRef(onStale);
  const onHeartbeatRef = useRef(onHeartbeat);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);

  useEffect(() => {
    onPollErrorRef.current = onPollError;
  }, [onPollError]);

  useEffect(() => {
    onRateLimitedRef.current = onRateLimited;
  }, [onRateLimited]);

  useEffect(() => {
    onStaleRef.current = onStale;
  }, [onStale]);

  useEffect(() => {
    onHeartbeatRef.current = onHeartbeat;
  }, [onHeartbeat]);

  const stableOnUpdate = useRef((s: ReportPptxStatus) => onUpdateRef.current(s));
  const stableOnTerminal = useRef((s: ReportPptxStatus, r: string) =>
    onTerminalRef.current?.(s, r),
  );
  const stableOnPollError = useRef((e: unknown, k: PollErrorKind) =>
    onPollErrorRef.current?.(e, k),
  );
  const stableOnRateLimited = useRef((ms: number) => onRateLimitedRef.current?.(ms));
  const stableOnStale = useRef((s: ReportPptxStatus) => onStaleRef.current?.(s));
  const stableOnHeartbeat = useRef((s: ReportPptxStatus) => onHeartbeatRef.current?.(s));

  useEffect(() => {
    if (!surveyId) return;

    const unsubscribe = subscribeReportStatusPoll(surveyId, {
      id: subscriberId,
      watch,
      enabled,
      onUpdate: stableOnUpdate.current,
      onTerminal: stableOnTerminal.current,
      onPollError: stableOnPollError.current,
      onRateLimited: stableOnRateLimited.current,
      onStale: stableOnStale.current,
      onHeartbeat: stableOnHeartbeat.current,
    });

    return unsubscribe;
  }, [surveyId, subscriberId, watch]);

  useEffect(() => {
    if (!surveyId) return;
    setReportStatusPollEnabled(surveyId, subscriberId, enabled);
  }, [surveyId, subscriberId, enabled]);

  useEffect(() => {
    if (!surveyId) return;

    const onVisibility = () => {
      if (!document.hidden && enabled) {
        setReportStatusPollEnabled(surveyId, subscriberId, true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [surveyId, subscriberId, enabled]);
}
