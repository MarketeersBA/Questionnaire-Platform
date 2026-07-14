import type { ReactNode } from 'react';
import type { ExportFrameKind, ExportTheme } from './captureDefaults';

interface ExportFrameShellProps {
  theme: ExportTheme;
  frame: ExportFrameKind;
  width: number;
  height: number;
  isReady: boolean;
  chartId: string;
  children: ReactNode;
}

export function ExportFrameShell({
  theme,
  frame,
  width,
  height,
  isReady,
  chartId,
  children,
}: ExportFrameShellProps) {
  return (
    <div
      data-export-frame={frame}
      data-export-theme={theme}
      data-export-chart-id={chartId}
      data-export-ready={isReady ? 'true' : 'false'}
      data-export-width={String(width)}
      data-export-height={String(height)}
      className="export-frame-root"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        minWidth: `${width}px`,
        minHeight: `${height}px`,
        maxWidth: `${width}px`,
        maxHeight: `${height}px`,
        overflow: 'hidden',
        backgroundColor: theme === 'dark' ? '#020617' : '#ffffff',
        color: theme === 'dark' ? '#f8fafc' : '#0f172a',
        animation: 'none',
        transition: 'none',
      }}
    >
      {children}
    </div>
  );
}
