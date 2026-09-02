import axios, { type InternalAxiosRequestConfig, AxiosError, type AxiosInstance } from 'axios';
import { isExportFrameRoute } from '../export/exportFrameContext';
import { getReportShareLink } from '../utils/surveyLinks';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Pull the server-supplied filename out of a Content-Disposition header.
 *
 * Prefers the RFC 5987 `filename*=UTF-8''…` form, which is what Starlette emits
 * whenever the name contains non-ASCII characters — Arabic project names, for
 * instance — and falls back to the plain quoted `filename=` form.
 */
export function filenameFromResponse(
  contentDisposition: unknown,
  fallback: string,
): string {
  const header = typeof contentDisposition === 'string' ? contentDisposition : '';
  if (!header) return fallback;

  // RFC 5987 extended form wins: it carries the real, percent-encoded name.
  const extended = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (extended?.[1]) {
    try {
      const decoded = decodeURIComponent(extended[1].trim());
      if (decoded) return decoded;
    } catch {
      /* Malformed encoding — fall through to the plain form. */
    }
  }

  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  const name = plain?.[1]?.trim();
  return name || fallback;
}

/** Hand a blob to the browser as a download under an explicit filename. */
function triggerBrowserDownload(data: BlobPart, filename: string, mimeType: string) {
  const url = window.URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Standardized API Error structure for the platform. */
export interface ApiError {
  message: string;
  actionable_message: string;
  code?: string;
  status?: number;
  retryable: boolean;
}

/** Configuration for Abortable and Retryable requests. */
export interface RequestOptions {
  signal?: AbortSignal;
  retry?: boolean;
  maxRetries?: number;
  skipAuthRedirect?: boolean;
  headers?: Record<string, string>;
}

export type ApiRequestConfig = InternalAxiosRequestConfig & RequestOptions & {
  _retryCount?: number;
};

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30s default timeout
});

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;

function isRetryableError(error: AxiosError): boolean {
  if (!error.config) return false;

  // Retry on specific status codes (Transient Server Errors)
  const status = error.response?.status;
  if (status && [502, 503, 504].includes(status)) return true;

  // Retry on network timeouts or connection loss
  if (error.code === 'ECONNABORTED' || error.message.includes('Network Error')) return true;

  return false;
}

function extractErrorMessage(error: any): string {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.response?.data?.detail) return error.response.data.detail;
  if (error.message === 'Network Error') return 'Network connection lost. Please check your internet.';
  if (error.code === 'ECONNABORTED') return 'Request timed out. The server is taking too long.';
  return 'An unexpected error occurred.';
}

function shouldSkipAuthRedirect(config: ApiRequestConfig | undefined): boolean {
  if (config?.skipAuthRedirect) return true;
  const path = window.location.pathname;
  if (path.startsWith('/s/')) return true;
  // A client reading a shared report has no account, so redirecting them to
  // the login screen would strand them on a page they can never get past.
  if (path.startsWith('/r/')) return true;
  return isExportFrameRoute();
}

/**
 * Identifier this browser presents when opening a shared report.
 *
 * A share link has a seat limit — how many distinct people may ever open it —
 * and with no login the only durable handle on a visitor is an id their own
 * browser keeps. The server issues one on the first visit and echoes it back;
 * we store it so a returning viewer is recognised rather than charged a second
 * seat. Stored in localStorage (not sessionStorage) precisely so that closing
 * the tab and coming back tomorrow does not cost the client another seat.
 */
const VIEWER_ID_KEY = 'reportViewerId';

export function getReportViewerId(): string | null {
  try {
    return localStorage.getItem(VIEWER_ID_KEY);
  } catch {
    return null; // private mode with storage disabled
  }
}

export function rememberReportViewerId(id: string | undefined | null): void {
  if (!id) return;
  try {
    localStorage.setItem(VIEWER_ID_KEY, id);
  } catch {
    /* storage unavailable — the visitor simply spends a seat per visit */
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const isPublicSurveyEndpoint = config.url?.startsWith('s/');

  if (token && !isPublicSurveyEndpoint) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as ApiRequestConfig;
    if (!config) return Promise.reject(error);

    // 1. Handle Silent Failures & Deterministic Aborts
    const status = error.response?.status;

    // 2. Platform Principle: "Retry transient failures, fail fast on deterministic ones."
    const isRetryDisabled = config.retry === false;
    const retryCount = config._retryCount || 0;

    if (!isRetryDisabled && isRetryableError(error) && retryCount < (config.maxRetries || MAX_RETRIES)) {
      config._retryCount = retryCount + 1;
      const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount); // Exponential backoff

      console.warn(`[API] Transient failure detected. Retrying in ${delay}ms... (Attempt ${config._retryCount})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return api(config);
    }

    // 3. Handle Auth Failures
    if (status === 401 && !shouldSkipAuthRedirect(config)) {
      localStorage.removeItem('token');
      const path = window.location.pathname;
      if (!path.startsWith('/auth') && path !== '/') {
        window.location.href = '/';
      }
    }

    // 4. Platform Principle: "Never fail silently."
    // Attach actionable hardware error info
    const enrichedError: ApiError = {
      message: error.message,
      actionable_message: extractErrorMessage(error),
      code: error.code,
      status: status,
      retryable: isRetryableError(error),
    };

    // Replace the error object so the UI gets the actionable message
    return Promise.reject(enrichedError);
  }
);

export const auth = {
  login: async (username: string, password: string, options?: RequestOptions) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    const response = await api.post('/auth/token', formData, options);
    return response.data;
  },
  signup: async (data: { username: string; email?: string; password: string }, options?: RequestOptions) => {
    const response = await api.post('/auth/signup', data, options);
    return response.data;
  },
  me: async (options?: RequestOptions) => {
    const response = await api.get('/auth/me', options);
    return response.data;
  },
  logout: async (options?: RequestOptions) => {
    await api.post('/auth/logout', null, options);
  },
};

export const templates = {
  list: async (options?: RequestOptions) => (await api.get('/templates/', options)).data,
  create: async (data: any, options?: RequestOptions) => (await api.post('/templates/', data, options)).data,
  update: async (id: string, data: any, options?: RequestOptions) => (await api.put(`/templates/${id}`, data, options)).data,
  delete: async (id: string, options?: RequestOptions) => (await api.delete(`/templates/${id}`, options)).data,
  get: async (id: string, options?: RequestOptions) => (await api.get(`/templates/${id}`, options)).data,
  getHistory: async (name: string, options?: RequestOptions) => (await api.get(`/templates/history/${name}`, options)).data,
  rollback: async (id: string, options?: RequestOptions) => (await api.post(`/templates/rollback/${id}`, null, options)).data,
  upload: async (file: File, options?: RequestOptions) => {
    const formData = new FormData();
    formData.append('file', file);
    return (await api.post('/templates/upload', formData, {
      ...options,
      headers: { 'Content-Type': 'multipart/form-data', ...options?.headers }
    })).data;
  },
};

/**
 * Shared, short-lived result for the survey list.
 *
 * Seven components call `surveys.list()`, and several mount together — the
 * dashboard, the surveys table, the reports grid, the command palette. Each was
 * issuing its own request for the same ~1 MB payload, so navigating the app
 * produced a burst of identical fetches that queued behind one another.
 *
 * Two mechanisms, deliberately both:
 *   - an in-flight promise, so simultaneous callers share one request. This is
 *     exact: nobody can observe stale data because there is only ever one
 *     answer in flight.
 *   - a 4-second window afterwards, which covers navigating between pages
 *     without re-fetching, and is far shorter than the time it takes anyone to
 *     create or edit a survey and look for it.
 *
 * Mutations call `invalidateSurveyList()` so a change is never waited out.
 */
const SURVEY_LIST_TTL_MS = 4000;
let surveyListInFlight: Promise<any> | null = null;
let surveyListCache: { at: number; data: any } | null = null;

export function invalidateSurveyList(): void {
  surveyListCache = null;
  surveyListInFlight = null;
}

export const surveys = {
  /**
   * All surveys. Deduplicated and briefly cached — see the notes above.
   *
   * Pass `{ fresh: true }` after a mutation, or when the caller specifically
   * needs to see a change it just made.
   */
  list: (options?: RequestOptions & { fresh?: boolean }) => {
    if (options?.fresh) invalidateSurveyList();

    if (surveyListCache && Date.now() - surveyListCache.at < SURVEY_LIST_TTL_MS) {
      return Promise.resolve(surveyListCache.data);
    }
    if (surveyListInFlight) return surveyListInFlight;

    surveyListInFlight = api
      .get('/surveys/', options)
      .then((res) => {
        surveyListCache = { at: Date.now(), data: res.data };
        return res.data;
      })
      .finally(() => {
        // Cleared either way: a failed request must not wedge every later
        // caller onto a rejected promise.
        surveyListInFlight = null;
      });

    return surveyListInFlight;
  },
  create: (data: any, options?: RequestOptions) => api.post('/surveys/', data, options).then((res) => { invalidateSurveyList(); return res.data; }),
  checkCode: (code: string, excludeId?: string | null, options?: RequestOptions) => {
    let url = `/surveys/check-code/${code}`;
    if (excludeId) url += `?exclude_id=${excludeId}`;
    return api.get(url, options).then((res) => res.data);
  },
  get: (id: string, options?: RequestOptions) => api.get(`/surveys/${id}`, options).then((res) => res.data),
  update: (id: string, data: any, options?: RequestOptions) => api.put(`/surveys/${id}`, data, options).then((res) => { invalidateSurveyList(); return res.data; }),
  /**
   * Remove a survey. Archives by default.
   *
   * `permanent` erases the survey and everything belonging to it — responses,
   * reports, share links, respondent tokens, cached insights. Not reversible,
   * so the caller has to ask for it rather than getting it by default.
   */
  delete: (id: string, opts?: { permanent?: boolean }, options?: RequestOptions) =>
    api
      .delete(`/surveys/${id}${opts?.permanent ? '?permanent=true' : ''}`, options)
      .then((res) => { invalidateSurveyList(); return res.data; }),
  stats: (options?: RequestOptions) => api.get('/surveys/stats', options).then((res) => res.data),
};

export const tokens = {
  generate: async (surveyId: string, count: number, options?: RequestOptions) =>
    (await api.post('/tokens/generate', { survey_id: surveyId, count }, options)).data,
  listBySurvey: async (surveyId: string, params: { status?: string; batch_id?: string; page?: number; page_size?: number } = {}, options?: RequestOptions) =>
    (await api.get(`/tokens/survey/${surveyId}`, { ...options, params })).data,
  bulkUpdate: async (data: { token_ids: string[]; status?: string; expires_at?: string }, options?: RequestOptions) =>
    (await api.post('/tokens/bulk-update', data, options)).data,
  getSummary: async (surveyId: string, options?: RequestOptions) =>
    (await api.get(`/tokens/survey/${surveyId}/summary`, options)).data,
};

export const masterLink = {
  generateToken: async (surveyId: string, deviceId?: string, options?: RequestOptions) =>
    (await api.post(`s/master-link/${surveyId}/generate-token`, { device_id: deviceId }, options)).data as { token: string },
};

export const analytics = {
  getFunnel: async (surveyId: string, options?: RequestOptions) =>
    (await api.get(`/analytics/funnel/${surveyId}`, options)).data,
  getTrends: async (surveyId: string, days: number = 30, options?: RequestOptions) =>
    (await api.get(`/analytics/trends/${surveyId}?days=${days}`, options)).data,
  getOrphans: async (options?: RequestOptions) =>
    (await api.get('/analytics/orphans', options)).data,
  getOrphanDetails: async (reason: string, options?: RequestOptions) =>
    (await api.get(`/analytics/orphans/${reason}`, options)).data,
  getPlatformStats: async (options?: RequestOptions) =>
    (await api.get('/analytics/platform-stats', options)).data,
  compare: async (surveyIds: string[], options?: RequestOptions) =>
    (await api.post('/analytics/compare', surveyIds, options)).data,
  generateReport: async (surveyId: string, reportOptions: any = {}, force: boolean = false, options?: RequestOptions) =>
    (await api.post(`/analytics/generate-report/${surveyId}${force ? '?force=true' : ''}`, reportOptions, options)).data,
  getUsage: async (surveyId: string, options?: RequestOptions) =>
    (await api.get(`/analytics/usage/${surveyId}`, options)).data,
  // ── Survey Report Endpoints ──
  getReport: async (
    surveyId: string,
    reportOptions?: { exportFrame?: boolean },
    options?: RequestOptions
  ) =>
    (
      await api.get(`/analytics/report/${surveyId}`, {
        ...options,
        skipAuthRedirect: reportOptions?.exportFrame ?? isExportFrameRoute(),
      } as ApiRequestConfig)
    ).data,
  /**
   * Read a report through a client share token — no authentication.
   * `skipAuthRedirect` stops a 404 bouncing an unauthenticated client to login.
   */
  getSharedReport: async (token: string, options?: RequestOptions) => {
    const viewerId = getReportViewerId();
    const response = await api.get(`/analytics/public/report/${token}`, {
      ...options,
      skipAuthRedirect: true,
      headers: viewerId ? { 'X-Report-Viewer-Id': viewerId } : undefined,
    } as ApiRequestConfig);
    // First visit: the server assigned this browser an id. Keep it, or every
    // return visit would look like a new person and burn another seat.
    rememberReportViewerId(response.headers['x-report-viewer-id']);
    return response.data;
  },
  /** Mint (or fetch) the shareable link for a report. Idempotent. */
  createReportShare: async (surveyId: string, options?: RequestOptions) =>
    (await api.post(`/analytics/report/${surveyId}/share`, {}, options)).data,
  /** Revoke every live share link for a report. */
  revokeReportShare: async (surveyId: string, options?: RequestOptions) =>
    (await api.delete(`/analytics/report/${surveyId}/share`, options)).data,

  /**
   * The report's one share link, created on first call.
   *
   * Idempotent, like the survey master link: calling it repeatedly returns the
   * same URL instead of minting a second link that competes with one already
   * sent to a client.
   */
  getShareLink: async (surveyId: string, options?: RequestOptions): Promise<ReportShareLink> =>
    (await api.get(`/analytics/report/${surveyId}/share-link`, options)).data,

  /**
   * The existing share link, or null. Never creates one.
   *
   * For list views, where `getShareLink`'s create-on-miss behaviour would turn
   * rendering a grid into one write per row.
   */
  peekShareLink: async (
    surveyId: string,
    options?: RequestOptions
  ): Promise<ReportShareLink | null> =>
    (await api.get(`/analytics/report/${surveyId}/share-link/peek`, options)).data,

  /** Change the viewer limit or expiry. The URL is unaffected. */
  updateShareLink: async (
    surveyId: string,
    payload: {
      label?: string;
      max_viewers?: number | null;
      expires_at?: string | null;
      unlimited_expiry?: boolean;
    },
    options?: RequestOptions
  ): Promise<ReportShareLink> =>
    (await api.patch(`/analytics/report/${surveyId}/share-link`, payload, options)).data,

  /** Issue a new URL and stop the old one working. Limits carry over. */
  resetShareLink: async (surveyId: string, options?: RequestOptions): Promise<ReportShareLink> =>
    (await api.post(`/analytics/report/${surveyId}/share-link/reset`, {}, options)).data,

  /** Download the report as PDF (analyst view). */
  downloadReportPdf: async (surveyId: string, options?: RequestOptions) => {
    const response = await api.get(`/analytics/report/${surveyId}/download-pdf`, {
      ...options,
      responseType: 'blob',
      // Printing the page in headless Chromium takes longer than a normal call.
      timeout: 180000,
    } as ApiRequestConfig);
    triggerBrowserDownload(
      response.data,
      filenameFromResponse(
        response.headers?.['content-disposition'],
        `Marketeers_Report_${surveyId}.pdf`
      ),
      'application/pdf'
    );
  },

  /**
   * Download the PPTX, building it first if the deck does not exist yet.
   *
   * "Export" has to mean a file arrives. Previously PPTX either opened a build
   * dialog (analyst) or failed with a 409 telling the client to go ask someone
   * (share link) — neither of which is a download. This resolves the whole
   * thing: fetch it if it is there, otherwise build it, wait, and fetch it.
   *
   * `onProgress` reports a coarse stage so the caller can keep a toast honest
   * during what may be a couple of minutes of work.
   */
  downloadPptxEnsuringBuild: async (
    target: { surveyId: string } | { shareToken: string },
    onProgress?: (stage: string, percent?: number) => void
  ) => {
    const shared = 'shareToken' in target;
    const base = shared
      ? `/analytics/public/report/${target.shareToken}`
      : `/analytics/report/${target.surveyId}`;
    const downloadUrl = shared ? `${base}/download` : `${base}/download`;
    const common = shared ? { skipAuthRedirect: true } : {};

    const fetchFile = async () => {
      const response = await api.get(downloadUrl, {
        ...common,
        responseType: 'blob',
        timeout: 180000,
      } as ApiRequestConfig);
      triggerBrowserDownload(
        response.data,
        filenameFromResponse(
          response.headers?.['content-disposition'],
          'Marketeers_Report.pptx'
        ),
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
    };

    try {
      onProgress?.('Fetching presentation');
      await fetchFile();
      return;
    } catch (err: any) {
      // 404/409 mean "no deck yet", which is a thing we can fix. Anything else
      // is a real fault and must not be masked by starting a build.
      const status = err?.response?.status;
      if (status !== 404 && status !== 409) throw err;
    }

    onProgress?.('Building presentation');
    await api.post(`${base}/generate-pptx`, {}, common as ApiRequestConfig);

    const statusUrl = shared ? `${base}/pptx-status` : `${base}/status`;
    const deadline = Date.now() + 10 * 60 * 1000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 4000));

      const { data } = await api.get(statusUrl, common as ApiRequestConfig);
      const state = String(data?.pptx_status ?? data?.status ?? '').toUpperCase();
      const percent = data?.pptx_progress ?? data?.progress;
      onProgress?.(data?.pptx_stage || data?.stage || 'Building presentation', percent);

      if (state === 'READY' || data?.available === true) {
        onProgress?.('Fetching presentation');
        await fetchFile();
        return;
      }
      if (state === 'FAILED') {
        throw new Error('The presentation build failed on the server.');
      }
    }

    throw new Error('The presentation is taking unusually long. Try again shortly.');
  },

  /** Download the report through a share link, as PDF or PPTX. */
  downloadSharedReport: async (
    token: string,
    format: 'pdf' | 'pptx',
    options?: RequestOptions
  ) => {
    const suffix = format === 'pdf' ? 'download-pdf' : 'download';
    const response = await api.get(`/analytics/public/report/${token}/${suffix}`, {
      ...options,
      responseType: 'blob',
      skipAuthRedirect: true,
      timeout: 180000,
    } as ApiRequestConfig);
    triggerBrowserDownload(
      response.data,
      filenameFromResponse(
        response.headers?.['content-disposition'],
        `Marketeers_Report.${format}`
      ),
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
  },
  getReportStatus: async (
    surveyId: string,
    options?: RequestOptions
  ): Promise<{ data: ReportPptxStatus; pollIntervalMs?: number }> => {
    const response = await api.get(`/analytics/report/${surveyId}/status`, options);
    const headerInterval = response.headers['x-poll-interval'];
    const bodyInterval = response.data?.poll_interval_seconds;
    const seconds = bodyInterval ?? (headerInterval ? Number(headerInterval) : undefined);
    const pollIntervalMs =
      typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : undefined;
    return { data: response.data, pollIntervalMs };
  },
  getAiCosts: async (surveyId: string, options?: RequestOptions) =>
    (await api.get(`/analytics/reports/${surveyId}/ai-costs`, options)).data,
  updateOpportunityInsights: async (
    surveyId: string,
    opportunity_insights: any[],
    options?: RequestOptions,
  ) =>
    (
      await api.patch(
        `/analytics/report/${surveyId}/opportunity-insights`,
        { opportunity_insights },
        options,
      )
    ).data,
  slice: async (surveyId: string, filters: any, options?: RequestOptions) =>
    (await api.post(`/analytics/report/${surveyId}/slice`, filters, options)).data,
  downloadReport: async (surveyId: string, options?: RequestOptions) => {
    const response = await api.get(`/analytics/report/${surveyId}/download`, { ...options, responseType: 'blob' });
    triggerBrowserDownload(
      response.data,
      filenameFromResponse(
        response.headers?.['content-disposition'],
        // Only reached if the header is missing; the survey id alone is an
        // opaque ObjectId, so pair it with a readable prefix.
        `Marketeers_Report_${surveyId}.pptx`,
      ),
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
  },
  invalidateReport: async (surveyId: string, options?: RequestOptions) =>
    (await api.delete(`/analytics/report/${surveyId}`, options)).data,
  getProductTestMeta: async (surveyId: string, options?: RequestOptions) =>
    (await api.get(`/analytics/survey/${surveyId}/product-test/meta`, options)).data,
  // ── AI Governance & Quota Telemetry (Admin Only) ──
  getAIQuotaStatus: async (options?: RequestOptions) =>
    (await api.get('/analytics/admin/ai-quota-status', options)).data,
  getAIAlerts: async (options?: RequestOptions) =>
    (await api.get('/analytics/admin/ai-alerts', options)).data,
  acknowledgeAIAlert: async (alertId: string, options?: RequestOptions) =>
    (await api.post(`/analytics/admin/ai-alerts/${alertId}/acknowledge`, null, options)).data,
  generatePptx: async (surveyId: string, pptxOptions?: { forceRetry?: boolean }, options?: RequestOptions) => {
    const suffix = pptxOptions?.forceRetry ? '?force_retry=true' : '';
    return (await api.post(`/analytics/report/${surveyId}/generate-pptx${suffix}`, null, options)).data;
  },
  cancelPptx: async (surveyId: string, options?: RequestOptions) =>
    (await api.post(`/analytics/report/${surveyId}/cancel-pptx`, null, options)).data,
};

export interface PptxExportErrorPayload {
  code?: string;
  stage?: string;
  message?: string;
  timestamp?: string;
  retryable?: boolean;
  retry_guidance?: string;
  validation_errors?: string[];
  validation_warnings?: string[];
}

/**
 * Absolute URL for a share link, built against the host the admin is actually on.
 *
 * The server also returns a `url`, but it composes it from a configured public
 * address — which is right in production and wrong the moment anyone runs the
 * app anywhere else, handing out a production link from a local session. The
 * browser already knows the correct origin, so it does the joining.
 */
export function shareLinkUrl(share: { path?: string; token?: string }): string {
  if (share.token) return getReportShareLink(share.token);
  const path = share.path ?? '';
  return `${window.location.origin}${path}`;
}

/**
 * A shareable report link as the admin table sees it.
 *
 * `max_viewers` is the seat limit — how many distinct people may ever open the
 * link — and null means unlimited. `seats_remaining` is null for the same
 * reason. `status` is derived server-side so the table and the backend cannot
 * disagree about whether a link is still usable.
 */
export interface ReportShareLink {
  share_id: string;
  survey_id: string;
  label: string | null;
  /** Path only, e.g. `/r/abc123`. Join with the current origin — see `shareLinkUrl`. */
  path: string;
  /** Server-composed absolute URL. Unreliable: built from deploy-time config
   *  that is wrong outside production. Kept for API consumers, not for the UI. */
  url: string | null;
  token: string;
  status: 'active' | 'unopened' | 'full' | 'expired' | 'revoked';
  max_viewers: number | null;
  seats_used: number;
  seats_remaining: number | null;
  view_count: number;
  expires_at: string | null;
  created_at: string | null;
  created_by: string | null;
  revoked_at: string | null;
  last_viewed_at: string | null;
  pptx_downloads: number;
  pdf_downloads: number;
  viewers: Array<{
    viewer_id: string;
    first_seen: string | null;
    last_seen: string | null;
    view_count: number;
  }>;
}

export interface ReportPptxStatus {
  survey_id: string;
  /** Server-advised poll interval (seconds) — use for adaptive polling. */
  poll_interval_seconds?: number;
  pptx_job_id?: string;
  pptx_started_at?: string;
  pptx_finished_at?: string;
  pptx_elapsed_seconds?: number;
  pptx_idle_seconds?: number;
  pptx_attempt?: number;
  pptx_stale?: boolean;
  pptx_retryable?: boolean;
  pptx_cancel_requested?: boolean;
  pptx_capture_total?: number;
  pptx_capture_completed?: number;
  pptx_current_chart_id?: string;
  pptx_current_chart_title?: string;
  pptx_stage_detail?: string;
  user_message?: string;
  status?: string;
  pptx_status?: string;
  pptx_progress?: number;
  pptx_stage?: string;
  pptx_render_mode?: string;
  pptx_rollout_stage?: string;
  pptx_error?: PptxExportErrorPayload | null;
  error?: string;
  retry_count?: number;
  status_history?: unknown[];
}

export const users = {
  list: async (options?: RequestOptions) => (await api.get('/users/', options)).data,
  update: async (id: string, data: any, options?: RequestOptions) => (await api.put(`/users/${id}`, data, options)).data,
  delete: async (id: string, options?: RequestOptions) => (await api.delete(`/users/${id}`, options)).data,
};

export const attributeBanks = {
  list: async (options?: RequestOptions) => (await api.get('/attribute-banks/', options)).data,
  get: async (category: string, options?: RequestOptions) => (await api.get(`/attribute-banks/${category}`, options)).data,
  createOrUpdate: async (data: any, options?: RequestOptions) => (await api.post('/attribute-banks/', data, options)).data,
};

export const tasteTestConfigs = {
  list: async (options?: RequestOptions) => (await api.get('/taste-test-configs/', options)).data,
  get: async (configId: string, options?: RequestOptions) => (await api.get(`/taste-test-configs/${configId}`, options)).data,
  create: async (data: any, options?: RequestOptions) => (await api.post('/taste-test-configs/', data, options)).data,
  update: async (configId: string, data: any, options?: RequestOptions) => (await api.put(`/taste-test-configs/${configId}`, data, options)).data,
  deleteFamily: async (familyId: string, options?: RequestOptions) => (await api.delete(`/taste-test-configs/${familyId}`, options)).data,
};

export const masterQuestions = {
  getAttributes: async (options?: RequestOptions) => (await api.get('/questions/attributes', options)).data,
  getSubAttributes: async (attribute: string, options?: RequestOptions) => (await api.get(`/questions/sub-attributes/${encodeURIComponent(attribute)}`, options)).data,
  fetch: async (subAttributes: string[], options?: RequestOptions) => (await api.post('/questions/fetch', subAttributes, options)).data,
  fetchStructural: async (attributes: string[], options?: RequestOptions) => (await api.post('/questions/fetch-structural', attributes, options)).data,

  // Taste Test specific (Phase 2)
  /**
   * Canonical taste-test attribute library, grouped main -> sub-attributes,
   * including each question's per-point labels and its ideal point.
   */
  getTasteTestLibrary: async (language: 'en' | 'ar' = 'en', options?: RequestOptions) =>
    (await api.get(`/questions/taste-test/library?language=${language}`, options)).data,
  getTasteTestAttributes: async (options?: RequestOptions) => (await api.get('/questions/taste-test/attributes', options)).data,
  getTasteTestSubAttributes: async (attribute: string, options?: RequestOptions) => (await api.get(`/questions/taste-test/sub-attributes/${encodeURIComponent(attribute)}`, options)).data,
  fetchTasteTest: async (selections: Record<string, string[]>, options?: RequestOptions) => (await api.post('/questions/taste-test/fetch', selections, options)).data,
  getTasteTestModuleMetadata: async (options?: RequestOptions) => (await api.get('/questions/taste-test/module-metadata', options)).data,
};

export const purchaseFunnels = {
  create: async (data: any, options?: RequestOptions) => (await api.post('/purchase-funnels/', data, options)).data,
  get: async (surveyId: string, options?: RequestOptions) => (await api.get(`/purchase-funnels/survey/${surveyId}`, options)).data,
  update: async (id: string, data: any, options?: RequestOptions) => (await api.put(`/purchase-funnels/${id}`, data, options)).data,
};

export type {
  QuestionModule,
  QuestionModuleSummary,
  QuestionModuleUpdatePayload,
  ModuleQuestion,
  ModuleSection,
  ModuleSnapshots,
  QuestionModuleId,
} from '../types/questionModules';

export const questionModules = {
  /** Latest active version metadata for all modules */
  list: async (options?: RequestOptions) => (await api.get('/modules/', options)).data,
  /** Full module document (sections + questions) */
  get: async (moduleId: string, options?: RequestOptions) => (await api.get(`/modules/${moduleId}`, options)).data,
  /** Flat ordered question list */
  getQuestions: async (moduleId: string, options?: RequestOptions) =>
    (await api.get(`/modules/${moduleId}/questions`, options)).data,
  /** Phase 9 rollout stage and capability flags */
  getRollout: async (options?: RequestOptions) => (await api.get('/modules/rollout', options)).data,
  /** Analyst update — creates a new version */
  update: async (moduleId: string, data: import('../types/questionModules').QuestionModuleUpdatePayload, options?: RequestOptions) =>
    (await api.put(`/modules/${moduleId}`, data, options)).data,
  /** Create a brand-new custom module */
  create: async (
    data: {
      name: string;
      description?: string;
      sections: import('../types/questionModules').ModuleSection[];
    },
    options?: RequestOptions,
  ) => (await api.post('/modules/', data, options)).data,
  /** Parse an uploaded .xlsx into a draft module (never persists) */
  parseExcel: async (file: File, options?: RequestOptions) => {
    const form = new FormData();
    form.append('file', file);
    return (await api.post('/modules/parse-excel', form, options)).data;
  },
  /** Download the import template as a Blob, so auth headers still apply */
  downloadTemplate: async (options?: RequestOptions) =>
    (await api.get('/modules/excel-template', { ...options, responseType: 'blob' } as RequestOptions)).data,
};

export const responses = {
  getOverview: async (surveyId: string, options?: RequestOptions) =>
    (await api.get(`/responses/survey/${surveyId}/overview`, options)).data,
  getRespondents: async (surveyId: string, params: { lifecycle?: string; search?: string; page?: number; page_size?: number } = {}, options?: RequestOptions) =>
    (await api.get(`/responses/survey/${surveyId}/respondents`, { ...options, params })).data,
  getRespondentDetail: async (surveyId: string, token: string, options?: RequestOptions) =>
    (await api.get(`/responses/survey/${surveyId}/respondent/${token}`, options)).data,
  toggleExclude: async (surveyId: string, token: string, payload: { excluded: boolean; exclusion_reason?: string }, options?: RequestOptions) =>
    (await api.patch(`/responses/survey/${surveyId}/respondent/${token}/exclude`, payload, options)).data,
};

/** Payload for POST /s/{token}/followup — live AI probing of open-ended answers */
export interface FollowUpRequestPayload {
  question_id: string;
  question_text: string;
  answer_text: string;
  current_round: number;
  brand_name?: string;
  survey_objective?: string;
  custom_instructions?: string;
  /** Input channel — backend enforces apply_to_text / apply_to_voice */
  source?: 'text' | 'voice';
  question_category?: string;
  /** Declared respondent surface for backend eligibility guard */
  respondent_surface?:
    | 'taste_l2_open_end'
    | 'product_test_open_end'
    | 'product_test_heatmap_comment'
    | 'product_test_heatmap_point_comment';
  /** Optional context for pin-scoped heatmap probing. */
  heatmap_pin?: {
    index: number;
    x?: number;
    y?: number;
    intent?: string;
  };
}

/** Response from GET /s/{token}/voice-status/{feedback_id} */
export interface VoiceStatusResponse {
  status: string;
  transcript: string | null;
  error: string | null;
  is_terminal: boolean;
}

/** Response from POST /s/{token}/followup — mirrors backend smart_followup engine output */
export interface FollowUpResponse {
  action: 'probe' | 'complete';
  followup_text: string | null;
  /** @deprecated Legacy field — prefer followup_text */
  follow_up_question?: string | null;
  key_insights?: string[];
  reasoning?: string;
  /** @deprecated Not returned by current backend */
  quality?: string;
}

/** Normalize follow-up API response, supporting legacy field names */
export { parseFollowUpResponse } from '../utils/aiFollowup';
export type { ParsedFollowUpResponse } from '../utils/aiFollowup';

export const publicApi = {
  getSurvey: async (token: string, options?: RequestOptions) => (await api.get(`s/${token}`, options)).data,
  submitLayer1: async (token: string, answers: any, phone: string, options?: RequestOptions) =>
    (await api.post(`s/${token}/layer1`, { answers, phone }, options)).data,
  submitLayer2: async (token: string, answers: any, options?: RequestOptions) =>
    (await api.post(`s/${token}/layer2`, answers, options)).data,
  requestFollowUp: async (token: string, payload: FollowUpRequestPayload, options?: RequestOptions) =>
    (await api.post(`s/${token}/followup`, payload, options)).data as FollowUpResponse,
  getVoiceStatus: async (token: string, feedbackId: string, options?: RequestOptions) =>
    (await api.get(`s/${token}/voice-status/${feedbackId}`, options)).data as VoiceStatusResponse,
  uploadHeatmapVoiceNote: async (token: string, file: Blob, options?: RequestOptions) => {
    const formData = new FormData();
    formData.append('file', file, 'voice_note.webm');
    return (
      await api.post(`s/${token}/packaging-heatmap/voice-notes`, formData, {
        ...options,
        headers: {
          ...(options?.headers || {}),
          'Content-Type': 'multipart/form-data',
        },
      })
    ).data;
  },
  /** Direct FormData upload — returns compact asset reference for ProductTestAnswers. */
  uploadTrialMedia: async (
    token: string,
    questionId: string,
    file: File,
    options?: RequestOptions & { onProgress?: (percent: number) => void },
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    return (
      await api.post(`s/${token}/product-test/media/${questionId}`, formData, {
        ...options,
        timeout: 120_000,
        headers: {
          ...(options?.headers || {}),
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (event) => {
          if (options?.onProgress && event.total) {
            options.onProgress(Math.round((event.loaded * 100) / event.total));
          }
        },
      })
    ).data;
  },
  deleteTrialMedia: async (token: string, assetId: string, options?: RequestOptions) =>
    (await api.delete(`s/${token}/product-test/media/${assetId}`, options)).data,
  /** Public stream URL for respondent preview (img / video src). */
  trialMediaStreamUrl: (token: string, assetId: string) =>
    `${API_URL}/s/${token}/product-test/media/${assetId}`,
};

export const voice = {
  getAudio: async (feedbackId: string, options?: RequestOptions) =>
    (await api.get(`/voice-feedback/${feedbackId}/audio`, { ...options, responseType: 'blob' })).data,
  getStatus: async (feedbackId: string, options?: RequestOptions) => (await api.get(`/voice-feedback/status/${feedbackId}`, options)).data,
};

export const sessions = {
  get: async (token: string, options?: RequestOptions) => (await api.get(`/sessions/${token}`, options)).data,
  update: async (token: string, data: any, options?: RequestOptions) => (await api.put(`/sessions/${token}`, data, options)).data,
  delete: async (token: string, options?: RequestOptions) => (await api.delete(`/sessions/${token}`, options)).data,
};


export const brandAttributes = {
  getBank: async (options?: RequestOptions) => (await api.get('/brand-attributes/bank', options)).data,
  addAttribute: async (attr: any, options?: RequestOptions) => (await api.post('/brand-attributes/bank/attributes', attr, options)).data,
  updateAttribute: async (id: string, attr: any, options?: RequestOptions) => (await api.put(`/brand-attributes/bank/attributes/${id}`, attr, options)).data,
};

export const productTestConfigs = {
  list: async (options?: RequestOptions) => (await api.get('/product-test-configs/', options)).data,
  getRollout: async (options?: RequestOptions) =>
    (await api.get('/product-test-configs/rollout', options)).data,
  get: async (configId: string, options?: RequestOptions) => (await api.get(`/product-test-configs/${configId}`, options)).data,
  create: async (data: any, options?: RequestOptions) => (await api.post('/product-test-configs/', data, options)).data,
  update: async (configId: string, data: any, options?: RequestOptions) => (await api.put(`/product-test-configs/${configId}`, data, options)).data,
  deleteFamily: async (familyId: string, options?: RequestOptions) => (await api.delete(`/product-test-configs/${familyId}`, options)).data,
};

export const productTestQuestions = {
  getBankStatus: async (options?: RequestOptions) =>
    (await api.get('/product-test-questions/status', options)).data as {
      product_count: number;
      package_count: number;
      fixed_count: number;
      optional_count: number;
      package_fixed_count: number;
      package_optional_count: number;
      seeded: boolean;
      healthy: boolean;
      last_seeded_at?: string | null;
      seed_source?: string | null;
      excel_available?: boolean | null;
    },
  listProductQuestions: async (options?: RequestOptions) => (await api.get('/product-test-questions/', options)).data,
  getProductQuestion: async (questionId: string, options?: RequestOptions) => (await api.get(`/product-test-questions/${questionId}`, options)).data,
  listPackageQuestions: async (options?: RequestOptions) => (await api.get('/package-test-questions/', options)).data,
};

export const packagingHeatmap = {
  uploadImage: async (
    surveyId: string,
    side: 'front' | 'back',
    file: File,
    options?: RequestOptions,
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    return (
      await api.post(`/surveys/${surveyId}/packaging-heatmap/images/${side}`, formData, {
        ...options,
        headers: {
          ...(options?.headers || {}),
          'Content-Type': 'multipart/form-data',
        },
      })
    ).data;
  },
  uploadVoiceNote: async (
    surveyId: string,
    file: Blob,
    options?: RequestOptions,
  ) => {
    const formData = new FormData();
    formData.append('file', file, 'voice_note.webm');
    return (
      await api.post(`/surveys/${surveyId}/packaging-heatmap/voice-notes`, formData, {
        ...options,
        headers: {
          ...(options?.headers || {}),
          'Content-Type': 'multipart/form-data',
        },
      })
    ).data;
  },
  deleteImage: async (
    surveyId: string,
    side: 'front' | 'back',
    options?: RequestOptions,
  ) => (await api.delete(`/surveys/${surveyId}/packaging-heatmap/images/${side}`, options)).data,
  getImageMeta: async (
    surveyId: string,
    side: 'front' | 'back',
    options?: RequestOptions,
  ) => (await api.get(`/surveys/${surveyId}/packaging-heatmap/images/${side}`, options)).data,
  /** Public respondent URL — use as img src with survey token. */
  publicImageUrl: (token: string, side: 'front' | 'back') =>
    `${API_URL}/s/${token}/packaging-image/${side}`,
  getSummary: async (surveyId: string, options?: RequestOptions) =>
    (await api.get(`/surveys/${surveyId}/packaging-heatmap/summary`, options)).data,
  streamImage: async (
    surveyId: string,
    side: 'front' | 'back',
    options?: RequestOptions,
  ) => {
    const response = await api.get(`/surveys/${surveyId}/packaging-heatmap/images/${side}/stream`, {
      ...options,
      responseType: 'blob',
    });
    return response.data as Blob;
  },
  rebuildAggregates: async (surveyId: string, options?: RequestOptions) =>
    (await api.post(`/surveys/${surveyId}/packaging-heatmap/rebuild`, null, options)).data,
};

export const productTestMedia = {
  listAssets: async (surveyId: string, options?: RequestOptions) =>
    (await api.get(`/surveys/${surveyId}/product-test/media`, options)).data,
  getAssetMeta: async (surveyId: string, assetId: string, options?: RequestOptions) =>
    (await api.get(`/surveys/${surveyId}/product-test/media/${assetId}`, options)).data,
  streamAsset: async (surveyId: string, assetId: string, options?: RequestOptions) => {
    const response = await api.get(`/surveys/${surveyId}/product-test/media/${assetId}/stream`, {
      ...options,
      responseType: 'blob',
    });
    return response.data as Blob;
  },
  downloadAsset: async (surveyId: string, assetId: string, options?: RequestOptions) => {
    const response = await api.get(`/surveys/${surveyId}/product-test/media/${assetId}/download`, {
      ...options,
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};

export const surveyExports = {
  productTest: async (surveyId: string, options?: RequestOptions) => {
    const response = await api.get(`/exports/product-test/${surveyId}`, {
      ...options,
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};

export default api;
