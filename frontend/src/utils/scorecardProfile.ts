/**
 * Web report scorecard profile shaping.
 *
 * Screen report hides internal row-count KPIs (e.g. Evaluations) while leaving
 * backend payloads and PPTX exports unchanged. NPS remains visible when present.
 */

export const HIDDEN_WEB_SCORECARD_PROFILE_KEYS = new Set(['evaluations']);

export const normalizeScorecardProfileKey = (key: string): string =>
    String(key ?? '')
        .trim()
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ');

export const isHiddenWebScorecardProfileKey = (key: string): boolean =>
    HIDDEN_WEB_SCORECARD_PROFILE_KEYS.has(normalizeScorecardProfileKey(key));

export const isNpsProfileKey = (key: string): boolean =>
    normalizeScorecardProfileKey(key) === 'nps';

export const formatSignedNps = (value: unknown): string => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return String(value ?? '');
    }
    const score = Math.round(numeric);
    if (score > 0) {
        return `+${score}`;
    }
    return String(score);
};

export const formatScorecardProfileValue = (key: string, value: unknown): string => {
    const normalizedKey = normalizeScorecardProfileKey(key);

    if (isNpsProfileKey(key)) {
        return formatSignedNps(value);
    }
    if (normalizedKey.includes('t2b') || normalizedKey.includes('rate')) {
        return `${value}%`;
    }
    if (typeof value === 'number' && !Number.isInteger(value)) {
        return value.toFixed(2);
    }
    return String(value ?? '');
};

export const filterWebScorecardProfile = (
    profile: Record<string, unknown> | null | undefined,
): Array<[string, unknown]> => {
    if (!profile || typeof profile !== 'object') return [];
    return Object.entries(profile).filter(([key]) => !isHiddenWebScorecardProfileKey(key));
};

export const hasVisibleScorecardContent = (
    profile: Record<string, unknown> | null | undefined,
    strengths: unknown[] | null | undefined,
): boolean => filterWebScorecardProfile(profile).length > 0 || (strengths?.length ?? 0) > 0;
