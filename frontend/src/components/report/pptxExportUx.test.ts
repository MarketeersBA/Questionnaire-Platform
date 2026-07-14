import { describe, expect, it } from 'vitest';
import {
  buildPptxProgressSnapshot,
  canCloseModalDuringExport,
  formatCaptureProgressLine,
  formatElapsedDuration,
  resolvePptxDegradedState,
} from './pptxExportUx';
import type { ReportPptxStatus } from '../../services/api';

describe('pptxExportUx', () => {
  it('formats elapsed duration', () => {
    expect(formatElapsedDuration(45)).toBe('45s');
    expect(formatElapsedDuration(125)).toBe('2m 5s');
  });

  it('formats capture progress line', () => {
    const line = formatCaptureProgressLine({
      survey_id: 's1',
      pptx_capture_total: 10,
      pptx_capture_completed: 3,
      pptx_current_chart_title: 'NPS',
    });
    expect(line).toContain('4 of 10');
    expect(line).toContain('NPS');
  });

  it('detects stale degraded state while processing', () => {
    const state = resolvePptxDegradedState({
      survey_id: 's1',
      pptx_status: 'PROCESSING',
      pptx_stale: true,
    });
    expect(state).toBe('stale');
  });

  it('detects interrupted failed export', () => {
    const state = resolvePptxDegradedState({
      survey_id: 's1',
      pptx_status: 'FAILED',
      pptx_error: { code: 'worker_interrupted_or_stale', message: 'stale' },
    });
    expect(state).toBe('interrupted');
  });

  it('allows close during stale processing', () => {
    expect(canCloseModalDuringExport('processing', 'stale')).toBe(true);
    expect(canCloseModalDuringExport('processing', 'none')).toBe(false);
  });

  it('builds progress snapshot from status', () => {
    const snapshot = buildPptxProgressSnapshot({
      survey_id: 's1',
      pptx_elapsed_seconds: 90,
      pptx_stage_detail: 'Capturing chart 2/5',
    } as ReportPptxStatus);
    expect(snapshot.elapsedLabel).toBe('1m 30s');
    expect(snapshot.stageDetail).toBe('Capturing chart 2/5');
  });
});
