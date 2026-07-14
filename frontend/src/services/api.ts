import axios, { type InternalAxiosRequestConfig, AxiosError, type AxiosInstance } from 'axios';
import { isExportFrameRoute } from '../export/exportFrameContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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
  return isExportFrameRoute();
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

export const surveys = {
  list: (options?: RequestOptions) => api.get('/surveys/', options).then((res) => res.data),
  create: (data: any, options?: RequestOptions) => api.post('/surveys/', data, options).then((res) => res.data),
  checkCode: (code: string, options?: RequestOptions) => api.get(`/surveys/check-code/${code}`, options).then((res) => res.data),
  get: (id: string, options?: RequestOptions) => api.get(`/surveys/${id}`, options).then((res) => res.data),
  update: (id: string, data: any, options?: RequestOptions) => api.put(`/surveys/${id}`, data, options).then((res) => res.data),
  delete: (id: string, options?: RequestOptions) => api.delete(`/surveys/${id}`, options).then((res) => res.data),
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
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `report_${surveyId}.pptx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
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
