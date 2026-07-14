import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  heartbeatFingerprint,
  resetReportStatusPollHubForTests,
  statusFingerprint,
  subscribeReportStatusPoll,
} from './reportStatusPollHub';
import type { ReportPptxStatus } from '../services/api';

vi.mock('../services/api', () => ({
  analytics: {
    getReportStatus: vi.fn(),
  },
}));

import { analytics } from '../services/api';

const baseStatus: ReportPptxStatus = {
  survey_id: 'survey-1',
  pptx_status: 'PROCESSING',
  pptx_stage: 'capturing_charts',
  pptx_progress: 42,
};

describe('reportStatusPollHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReportStatusPollHubForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetReportStatusPollHubForTests();
    vi.useRealTimers();
  });

  it('status fingerprint changes on terminal transition', () => {
    const a = statusFingerprint(baseStatus);
    const b = statusFingerprint({ ...baseStatus, pptx_status: 'READY', pptx_progress: 100 });
    expect(a).not.toBe(b);
  });

  it('heartbeat fingerprint changes when chart progress updates', () => {
    const a = heartbeatFingerprint(baseStatus);
    const b = heartbeatFingerprint({
      ...baseStatus,
      pptx_capture_completed: 2,
      pptx_elapsed_seconds: 30,
    });
    expect(a).not.toBe(b);
  });

  it('coalesces two subscribers into one HTTP fetch per tick', async () => {
    const onUpdateA = vi.fn();
    const onUpdateB = vi.fn();
    let resolveFetch!: (value: { data: ReportPptxStatus; pollIntervalMs: number }) => void;
    const fetchDeferred = new Promise<{ data: ReportPptxStatus; pollIntervalMs: number }>(
      (resolve) => {
        resolveFetch = resolve;
      },
    );
    const fetchMock = vi
      .mocked(analytics.getReportStatus)
      .mockReturnValueOnce(fetchDeferred);

    const unsubA = subscribeReportStatusPoll('survey-coalesce', {
      id: 'sub-a',
      watch: 'pptx',
      enabled: true,
      onUpdate: onUpdateA,
    });
    const unsubB = subscribeReportStatusPoll('survey-coalesce', {
      id: 'sub-b',
      watch: 'pptx',
      enabled: true,
      onUpdate: onUpdateB,
    });

    await vi.runOnlyPendingTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ data: { ...baseStatus, pptx_progress: 42 }, pollIntervalMs: 3000 });
    await fetchDeferred;
    await vi.runOnlyPendingTimersAsync();

    expect(onUpdateA).toHaveBeenCalledTimes(1);
    expect(onUpdateB).toHaveBeenCalledTimes(1);

    unsubA();
    unsubB();
  });

  it('fires onHeartbeat when only heartbeat fields change', async () => {
    const onUpdate = vi.fn();
    const onHeartbeat = vi.fn();

    vi.mocked(analytics.getReportStatus)
      .mockResolvedValueOnce({
        data: { ...baseStatus, pptx_elapsed_seconds: 10 },
        pollIntervalMs: 3000,
      })
      .mockResolvedValueOnce({
        data: { ...baseStatus, pptx_elapsed_seconds: 20 },
        pollIntervalMs: 3000,
      });

    const unsub = subscribeReportStatusPoll('survey-hb', {
      id: 'sub-hb',
      watch: 'pptx',
      enabled: true,
      onUpdate,
      onHeartbeat,
    });

    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onHeartbeat).toHaveBeenCalled();
    unsub();
  });

  it('fires onRateLimited on 429 with retry delay', async () => {
    const onRateLimited = vi.fn();
    const rateErr = Object.assign(new Error('RATE_LIMITED'), { retryAfterMs: 5000 });

    vi.mocked(analytics.getReportStatus).mockRejectedValue(rateErr);

    const unsub = subscribeReportStatusPoll('survey-429', {
      id: 'sub-429',
      watch: 'pptx',
      enabled: true,
      onUpdate: vi.fn(),
      onRateLimited,
    });

    await vi.runOnlyPendingTimersAsync();

    expect(onRateLimited).toHaveBeenCalledWith(5000);
    unsub();
  });

  it('fires onStale when pptx_stale is true', async () => {
    const onStale = vi.fn();

    vi.mocked(analytics.getReportStatus).mockResolvedValue({
      data: { ...baseStatus, pptx_stale: true },
      pollIntervalMs: 3000,
    });

    const unsub = subscribeReportStatusPoll('survey-stale', {
      id: 'sub-stale',
      watch: 'pptx',
      enabled: true,
      onUpdate: vi.fn(),
      onStale,
    });

    await vi.runOnlyPendingTimersAsync();

    expect(onStale).toHaveBeenCalled();
    expect(onStale.mock.calls[0][0].pptx_stale).toBe(true);
    unsub();
  });

  it('stops polling after terminal READY', async () => {
    const onTerminal = vi.fn();

    vi.mocked(analytics.getReportStatus).mockResolvedValue({
      data: { ...baseStatus, pptx_status: 'READY', pptx_progress: 100 },
      pollIntervalMs: 3000,
    });

    const unsub = subscribeReportStatusPoll('survey-ready', {
      id: 'sub-ready',
      watch: 'pptx',
      enabled: true,
      onUpdate: vi.fn(),
      onTerminal,
    });

    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(onTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ pptx_status: 'READY' }),
      'pptx_ready',
    );
    expect(vi.mocked(analytics.getReportStatus)).toHaveBeenCalledTimes(1);
    unsub();
  });
});
