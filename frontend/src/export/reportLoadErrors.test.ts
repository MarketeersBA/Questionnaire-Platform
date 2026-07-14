import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isReportAuthMissing,
  reportAuthMissingError,
  resolveExportReportLoadError,
} from './reportLoadErrors';

describe('resolveExportReportLoadError', () => {
  it('maps 401 to report_auth_invalid', () => {
    const err = {
      response: { status: 401, data: { detail: 'Could not validate credentials' } },
      isAxiosError: true,
    };
    const resolved = resolveExportReportLoadError(err);
    expect(resolved.code).toBe('report_auth_invalid');
    expect(resolved.httpStatus).toBe(401);
  });

  it('maps 403 to report_auth_denied', () => {
    const err = { response: { status: 403, data: {} }, isAxiosError: true };
    expect(resolveExportReportLoadError(err).code).toBe('report_auth_denied');
  });

  it('maps 404 to report_not_found', () => {
    const err = { response: { status: 404, data: {} }, isAxiosError: true };
    expect(resolveExportReportLoadError(err).code).toBe('report_not_found');
  });
});

describe('reportAuthMissingError', () => {
  it('uses report_auth_missing code', () => {
    expect(reportAuthMissingError().code).toBe('report_auth_missing');
  });
});

describe('isReportAuthMissing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when token absent', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    });
    expect(isReportAuthMissing()).toBe(true);
  });

  it('returns false when token present', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => (key === 'token' ? 'jwt-here' : null),
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
    expect(isReportAuthMissing()).toBe(false);
  });
});
