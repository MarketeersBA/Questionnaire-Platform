// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { useSurveyDirection } from './useSurveyDirection';

describe('useSurveyDirection', () => {
    afterEach(() => {
        sessionStorage.clear();
    });

    it('returns rtl/ar when survey.language is ar', () => {
        const result = useSurveyDirection('ar', 'tok1');
        expect(result).toEqual({ isRtl: true, dir: 'rtl', language: 'ar' });
    });

    it('returns ltr/en when survey.language is en', () => {
        const result = useSurveyDirection('en', 'tok1');
        expect(result).toEqual({ isRtl: false, dir: 'ltr', language: 'en' });
    });

    it('falls back to the cached sessionStorage language before the survey loads', () => {
        sessionStorage.setItem('survey_lang_tok2', 'ar');
        const result = useSurveyDirection(undefined, 'tok2');
        expect(result.isRtl).toBe(true);
        expect(result.dir).toBe('rtl');
    });

    it('defaults to ltr/en when nothing is known', () => {
        const result = useSurveyDirection(undefined, undefined);
        expect(result).toEqual({ isRtl: false, dir: 'ltr', language: 'en' });
    });
});
