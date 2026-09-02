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

export function getMasterLink(surveyId: string): string {
    return `${getSurveyBaseUrl()}/m/${surveyId}`;
}

/**
 * Absolute URL for a report's share link (/r/:token).
 *
 * Uses the same base resolution as the survey master link on purpose: in dev it
 * is always `window.location.origin`, so a link created locally opens locally
 * even though docker-compose points the production base at the live domain. In
 * a production build an explicit base wins, falling back to the origin.
 *
 * The server also composes a URL, but from deploy-time config that is only
 * correct in production — which is how a locally created link ended up
 * pointing at the live site.
 */
export function getReportShareLink(token: string): string {
    return `${getSurveyBaseUrl()}/r/${token}`;
}
