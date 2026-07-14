import { useEffect, useState } from 'react';
import { EXPORT_CAPTURE_DEFAULTS } from './captureDefaults';
import { markExportError, markExportReady, resetExportReadySignal } from './exportReadyGlobal';
import type { ExportReadyMeta } from './types';

interface UseExportReadySignalOptions {
  enabled: boolean;
  meta: ExportReadyMeta | null;
  hasRenderError: boolean;
}

function waitForPaintCycles(cycles = 2) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(cycles);
  });
}

export function useExportReadySignal({
  enabled,
  meta,
  hasRenderError,
}: UseExportReadySignalOptions) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    resetExportReadySignal();
    setIsReady(false);

    if (!enabled || !meta) {
      return () => {
        resetExportReadySignal();
      };
    }

    if (hasRenderError) {
      markExportError('chart_render_failed');
      return () => {
        resetExportReadySignal();
      };
    }

    let cancelled = false;

    const settle = async () => {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
        await waitForPaintCycles(2);
        await new Promise((resolve) => {
          window.setTimeout(resolve, EXPORT_CAPTURE_DEFAULTS.readySettleMs);
        });
        if (cancelled) {
          return;
        }
        markExportReady(meta);
        setIsReady(true);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'export_ready_failed';
        markExportError(message);
        setIsReady(false);
      }
    };

    void settle();

    return () => {
      cancelled = true;
      resetExportReadySignal();
      setIsReady(false);
    };
  }, [enabled, hasRenderError, meta]);

  return isReady;
}
