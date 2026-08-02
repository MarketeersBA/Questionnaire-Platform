/**
 * Base URL for public survey links (/s/:token).
 *
 * Priority:
 * 1. In Vite dev — always window.location.origin so local tokens open locally
 *    even if docker-compose sets a production VITE_PUBLIC_SURVEY_BASE_URL.
 * 2. VITE_PUBLIC_SURVEY_BASE_URL — production / explicit override.
 * 3. window.location.origin — fallback.
 */
export function getSurveyBaseUrl(): string {
    // DEV is true for `vite` / Dockerfile.dev; false for production builds.
    if (import.meta.env.DEV) {
        return window.location.origin;
    }
    const envBase = import.meta.env.VITE_PUBLIC_SURVEY_BASE_URL?.trim();
    if (envBase) {
        return envBase.replace(/\/$/, '');
    }
    return window.location.origin;
}

export function getSurveyLink(token: string): string {
    return `${getSurveyBaseUrl()}/s/${token}`;
}
