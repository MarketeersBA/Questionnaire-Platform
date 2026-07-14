import type { ExportFrameKind, ExportTheme } from './captureDefaults';

export interface ExportFrameQuery {
  chartId: string;
  theme: ExportTheme;
  frame: ExportFrameKind;
}

export interface ExportReadyMeta {
  surveyId: string;
  chartId: string;
  chartType: string;
  theme: ExportTheme;
  frame: ExportFrameKind;
  width: number;
  height: number;
  readyAt: string;
}

export interface ExportChartOptions {
  width: number;
  height: number;
  includeTitle: boolean;
  includeAiHeadline: boolean;
  includeFootnotes: boolean;
  includeAiDeepAnalysis: boolean;
}
