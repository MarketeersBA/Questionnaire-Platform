/**
 * Detect headless PPTX export-frame routes (Playwright capture).
 *
 * Export frames must never trigger SPA login redirects on 401 — that unloads the
 * page and causes capture timeouts instead of a stable `data-export-error` surface.
 */

export const EXPORT_FRAME_PATH_SEGMENT = '/export-frame';

export function isExportFrameRoute(pathname: string = window.location.pathname): boolean {
  return pathname.includes(EXPORT_FRAME_PATH_SEGMENT);
}
