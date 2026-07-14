export type ExportTheme = 'light' | 'dark';
export type ExportFrameKind = 'viewport' | 'chart_body';

export const EXPORT_CAPTURE_DEFAULTS = {
  theme: 'light' as ExportTheme,
  aspectRatio: '16:9',
  viewportWidthPx: 1920,
  viewportHeightPx: 1080,
  deviceScaleFactor: 2,
  baseDpi: 96,
  slideWidthIn: 20,
  slideHeightIn: 11.25,
  chartBodyWidthIn: 18.2,
  chartBodyHeightIn: 7.5,
  imageFormat: 'png',
  includeAiHeadline: false,
  includeAiDeepAnalysis: false,
  includeTitle: false,
  includeFootnotes: false,
  readySettleMs: 120,
} as const;

export function chartBodyCapturePixels() {
  const scale = EXPORT_CAPTURE_DEFAULTS.baseDpi * EXPORT_CAPTURE_DEFAULTS.deviceScaleFactor;
  return {
    width: Math.round(EXPORT_CAPTURE_DEFAULTS.chartBodyWidthIn * scale),
    height: Math.round(EXPORT_CAPTURE_DEFAULTS.chartBodyHeightIn * scale),
  };
}

export function chartBodyViewportPixels() {
  const widthRatio = EXPORT_CAPTURE_DEFAULTS.chartBodyWidthIn / EXPORT_CAPTURE_DEFAULTS.slideWidthIn;
  const heightRatio = EXPORT_CAPTURE_DEFAULTS.chartBodyHeightIn / EXPORT_CAPTURE_DEFAULTS.slideHeightIn;
  return {
    width: Math.round(EXPORT_CAPTURE_DEFAULTS.viewportWidthPx * widthRatio),
    height: Math.round(EXPORT_CAPTURE_DEFAULTS.viewportHeightPx * heightRatio),
  };
}

export function resolveExportFrameDimensions(frame: ExportFrameKind) {
  if (frame === 'viewport') {
    return {
      width: EXPORT_CAPTURE_DEFAULTS.viewportWidthPx,
      height: EXPORT_CAPTURE_DEFAULTS.viewportHeightPx,
    };
  }

  return chartBodyViewportPixels();
}
