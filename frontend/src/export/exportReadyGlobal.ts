import type { ExportReadyMeta } from './types';

declare global {
  interface Window {
    __EXPORT_READY__?: boolean;
    __EXPORT_READY_META__?: ExportReadyMeta;
    __EXPORT_ERROR__?: string;
  }
}

export function resetExportReadySignal() {
  window.__EXPORT_READY__ = false;
  delete window.__EXPORT_READY_META__;
  delete window.__EXPORT_ERROR__;
}

export function markExportReady(meta: ExportReadyMeta) {
  window.__EXPORT_READY__ = true;
  window.__EXPORT_READY_META__ = meta;
  delete window.__EXPORT_ERROR__;
}

export function markExportError(message: string) {
  window.__EXPORT_READY__ = false;
  window.__EXPORT_ERROR__ = message;
  delete window.__EXPORT_READY_META__;
}
