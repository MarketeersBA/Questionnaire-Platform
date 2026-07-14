import {
  EXPORT_CAPTURE_DEFAULTS,
  type ExportFrameKind,
  type ExportTheme,
} from './captureDefaults';
import type { ExportFrameQuery } from './types';

const THEME_VALUES: ExportTheme[] = ['light', 'dark'];
const FRAME_VALUES: ExportFrameKind[] = ['viewport', 'chart_body'];

export function parseExportTheme(value: string | null): ExportTheme {
  if (value && THEME_VALUES.includes(value as ExportTheme)) {
    return value as ExportTheme;
  }
  return EXPORT_CAPTURE_DEFAULTS.theme;
}

export function parseExportFrame(value: string | null): ExportFrameKind {
  if (value && FRAME_VALUES.includes(value as ExportFrameKind)) {
    return value as ExportFrameKind;
  }
  return 'chart_body';
}

export function parseExportFrameQuery(searchParams: URLSearchParams): ExportFrameQuery | null {
  const chartId = searchParams.get('chart_id')?.trim();
  if (!chartId) {
    return null;
  }

  return {
    chartId,
    theme: parseExportTheme(searchParams.get('theme')),
    frame: parseExportFrame(searchParams.get('frame')),
  };
}
