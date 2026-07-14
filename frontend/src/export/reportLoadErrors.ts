/**
 * Stable error codes for ReportExportFrame / Playwright diagnostics.
 *
 * Aligns with backend preflight codes where possible (`auth_invalid`, etc.).
 */
import type { AxiosError } from 'axios';

export type ExportReportErrorCode =
  | 'report_auth_missing'
  | 'report_auth_invalid'
  | 'report_auth_denied'
  | 'report_not_found'
  | 'report_generating'
  | 'report_load_failed';

export interface ExportReportLoadError {
  code: ExportReportErrorCode;
  message: string;
  httpStatus?: number;
}

function axiosStatus(error: unknown): number | undefined {
  const ax = error as AxiosError | undefined;
  return ax?.response?.status;
}

function axiosDetail(error: unknown): string | undefined {
  const ax = error as AxiosError<{ detail?: unknown }> | undefined;
  const detail = ax?.response?.data?.detail;
  if (typeof detail === 'string') {
    return detail;
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const msg = (detail as { message?: unknown }).message;
    if (typeof msg === 'string') {
      return msg;
    }
  }
  return undefined;
}

/**
 * Map an analytics.getReport failure to a stable export-frame error code.
 */
export function resolveExportReportLoadError(error: unknown): ExportReportLoadError {
  const status = axiosStatus(error);
  const detail = axiosDetail(error);

  if (status === 401) {
    return {
      code: 'report_auth_invalid',
      message: detail || 'Report API returned 401 — capture or session token was rejected.',
      httpStatus: 401,
    };
  }

  if (status === 403) {
    return {
      code: 'report_auth_denied',
      message: detail || 'Report API returned 403 — token cannot read this survey report.',
      httpStatus: 403,
    };
  }

  if (status === 404) {
    return {
      code: 'report_not_found',
      message: detail || 'Report not found for this survey.',
      httpStatus: 404,
    };
  }

  if (status === 202) {
    return {
      code: 'report_generating',
      message: detail || 'Report is still generating.',
      httpStatus: 202,
    };
  }

  if (error instanceof Error && error.message.toLowerCase().includes('network')) {
    return {
      code: 'report_load_failed',
      message: error.message,
      httpStatus: status,
    };
  }

  return {
    code: 'report_load_failed',
    message:
      detail ||
      (error instanceof Error ? error.message : 'report_load_failed'),
    httpStatus: status,
  };
}

/**
 * True when localStorage has no bearer token (Playwright forgot to inject).
 */
export function isReportAuthMissing(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const token = window.localStorage.getItem('token');
  return !token || !token.trim();
}

export function reportAuthMissingError(): ExportReportLoadError {
  return {
    code: 'report_auth_missing',
    message: 'No bearer token in localStorage — capture session was not injected.',
  };
}
