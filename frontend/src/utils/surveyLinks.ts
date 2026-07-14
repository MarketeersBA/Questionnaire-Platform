/**
 * Base URL for public survey links (/s/:token).
 *
 * Priority:
 * 1. VITE_PUBLIC_SURVEY_BASE_URL — optional dev override (e.g. when browsing via localhost
 *    but sharing links on the LAN).
 * 2. window.location.origin — uses whatever host/IP you opened the app with.
 */
export function getSurveyBaseUrl(): string {
    const envBase = import.meta.env.VITE_PUBLIC_SURVEY_BASE_URL?.trim();
    if (envBase) {
        return envBase.replace(/\/$/, '');
    }
    return window.location.origin;
}

export function getSurveyLink(token: string): string {
    return `${getSurveyBaseUrl()}/s/${token}`;
}
