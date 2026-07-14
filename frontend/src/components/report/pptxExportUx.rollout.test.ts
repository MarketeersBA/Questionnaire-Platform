import { describe, expect, it } from 'vitest';
import {
  getPptxDegradedPresentation,
  resolvePptxDegradedState,
  shouldShowCancelExport,
} from './pptxExportUx';
import type { ReportPptxStatus } from '../../services/api';

describe('pptxExportUx rollout / recovery', () => {
  it('retry_available on FAILED with retryable flag', () => {
    const state = resolvePptxDegradedState({
      survey_id: 's1',
      pptx_status: 'FAILED',
      pptx_retryable: true,
      pptx_error: { code: 'validation_failed', message: 'gate failed' },
    });
    expect(state).toBe('retry_available');
    const presentation = getPptxDegradedPresentation(state);
    expect(presentation?.title).toContain('Retry');
  });

  it('rate_limited takes precedence', () => {
    const state = resolvePptxDegradedState(
      { survey_id: 's1', pptx_status: 'PROCESSING' },
      { rateLimited: true },
    );
    expect(state).toBe('rate_limited');
  });

  it('connection_unstable after repeated poll errors', () => {
    const state = resolvePptxDegradedState(
      { survey_id: 's1', pptx_status: 'PROCESSING' },
      { consecutivePollErrors: 4, connectionUnstable: true },
    );
    expect(state).toBe('connection_unstable');
  });

  it('cancel export visible during PROCESSING', () => {
    expect(shouldShowCancelExport('processing', 'PROCESSING')).toBe(true);
    expect(shouldShowCancelExport('ready', 'READY')).toBe(false);
  });

  it('terminal FAILED maps to interrupted for stale worker code', () => {
    const status: ReportPptxStatus = {
      survey_id: 's1',
      pptx_status: 'FAILED',
      pptx_error: {
        code: 'worker_interrupted_or_stale',
        message: 'interrupted',
        retryable: true,
      },
    };
    expect(resolvePptxDegradedState(status)).toBe('interrupted');
  });

  it('CANCELLED suggests retry', () => {
    expect(
      resolvePptxDegradedState({
        survey_id: 's1',
        pptx_status: 'CANCELLED',
      }),
    ).toBe('retry_available');
  });
});
