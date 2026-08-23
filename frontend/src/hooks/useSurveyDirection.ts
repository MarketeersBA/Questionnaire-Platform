/**
 * Single source of truth for respondent-facing survey direction/language.
 * Mirrors the fallback chain previously duplicated ad-hoc across PublicSurvey.tsx:
 * explicit survey.language -> cached sessionStorage language (available before
 * the survey payload loads) -> browser language as a last resort.
 */
export function useSurveyDirection(surveyLanguage: string | undefined | null, token: string | undefined) {
    const cachedSurveyLang = (() => {
        if (!token) return null;
        try {
            return sessionStorage.getItem(`survey_lang_${token}`);
        } catch {
            return null;
        }
    })();

    const isRtl =
        surveyLanguage === 'ar'
        || cachedSurveyLang === 'ar'
        || (!surveyLanguage && !cachedSurveyLang && typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ar'));

    return {
        isRtl,
        dir: (isRtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
        language: (isRtl ? 'ar' : 'en') as 'ar' | 'en',
    };
}
