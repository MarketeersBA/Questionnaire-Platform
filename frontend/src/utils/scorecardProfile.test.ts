import { describe, expect, it } from 'vitest';
import {
    filterWebScorecardProfile,
    formatScorecardProfileValue,
    formatSignedNps,
    hasVisibleScorecardContent,
    isHiddenWebScorecardProfileKey,
    isNpsProfileKey,
    normalizeScorecardProfileKey,
} from './scorecardProfile';

const BRAND_CARD_PROFILE = {
    Brand: 'Friday',
    'Overall Score': 4.25,
    'T2B %': 2.7,
    Evaluations: 260,
};

const BRAND_CARD_PROFILE_WITH_NPS = {
    ...BRAND_CARD_PROFILE,
    NPS: 30,
};

describe('scorecardProfile', () => {
    describe('normalizeScorecardProfileKey', () => {
        it('normalizes casing and underscores', () => {
            expect(normalizeScorecardProfileKey('Evaluations')).toBe('evaluations');
            expect(normalizeScorecardProfileKey('T2B_%')).toBe('t2b %');
            expect(normalizeScorecardProfileKey('NPS')).toBe('nps');
        });
    });

    describe('isHiddenWebScorecardProfileKey', () => {
        it('hides evaluations only', () => {
            expect(isHiddenWebScorecardProfileKey('Evaluations')).toBe(true);
            expect(isHiddenWebScorecardProfileKey('evaluations')).toBe(true);
            expect(isHiddenWebScorecardProfileKey('Brand')).toBe(false);
            expect(isHiddenWebScorecardProfileKey('Overall Score')).toBe(false);
            expect(isHiddenWebScorecardProfileKey('T2B %')).toBe(false);
            expect(isHiddenWebScorecardProfileKey('NPS')).toBe(false);
        });
    });

    describe('isNpsProfileKey', () => {
        it('matches NPS profile keys case-insensitively', () => {
            expect(isNpsProfileKey('NPS')).toBe(true);
            expect(isNpsProfileKey('nps')).toBe(true);
            expect(isNpsProfileKey('Overall Score')).toBe(false);
        });
    });

    describe('formatSignedNps', () => {
        it.each([
            [30, '+30'],
            [-10, '-10'],
            [0, '0'],
            [30.4, '+30'],
        ])('formats %s as %s', (value, expected) => {
            expect(formatSignedNps(value)).toBe(expected);
        });
    });

    describe('formatScorecardProfileValue', () => {
        it('formats NPS as a signed integer', () => {
            expect(formatScorecardProfileValue('NPS', 30)).toBe('+30');
            expect(formatScorecardProfileValue('NPS', -12)).toBe('-12');
        });

        it('keeps existing percent and decimal formatting', () => {
            expect(formatScorecardProfileValue('T2B %', 64)).toBe('64%');
            expect(formatScorecardProfileValue('Overall Score', 4.25)).toBe('4.25');
        });
    });

    describe('filterWebScorecardProfile', () => {
        it('keeps brand scorecard metrics and removes evaluations', () => {
            const visible = filterWebScorecardProfile(BRAND_CARD_PROFILE);
            expect(visible).toEqual([
                ['Brand', 'Friday'],
                ['Overall Score', 4.25],
                ['T2B %', 2.7],
            ]);
        });

        it('keeps NPS visible when present', () => {
            const visible = filterWebScorecardProfile(BRAND_CARD_PROFILE_WITH_NPS);
            expect(visible).toEqual([
                ['Brand', 'Friday'],
                ['Overall Score', 4.25],
                ['T2B %', 2.7],
                ['NPS', 30],
            ]);
        });

        it('returns empty array for null profile', () => {
            expect(filterWebScorecardProfile(null)).toEqual([]);
        });
    });

    describe('hasVisibleScorecardContent', () => {
        it('is true when only strengths remain after filtering evaluations', () => {
            expect(
                hasVisibleScorecardContent({ Evaluations: 260 }, [{ attribute: 'Taste', score: 4.8 }]),
            ).toBe(true);
        });

        it('is false when profile is only evaluations and no strengths', () => {
            expect(hasVisibleScorecardContent({ Evaluations: 260 }, [])).toBe(false);
        });

        it('is true for standard brand profile metrics', () => {
            expect(hasVisibleScorecardContent(BRAND_CARD_PROFILE, [])).toBe(true);
        });

        it('is true when only NPS remains after filtering evaluations', () => {
            expect(hasVisibleScorecardContent({ Evaluations: 260, NPS: 42 }, [])).toBe(true);
        });
    });

    describe('brand card NPS web display contract', () => {
        it('keeps NPS visible and formats it as a signed score for scorecard tiles', () => {
            const visible = filterWebScorecardProfile(BRAND_CARD_PROFILE_WITH_NPS);
            const npsEntry = visible.find(([key]) => isNpsProfileKey(key));

            expect(npsEntry).toEqual(['NPS', 30]);
            expect(isHiddenWebScorecardProfileKey('NPS')).toBe(false);
            expect(formatScorecardProfileValue('NPS', npsEntry?.[1])).toBe('+30');
            expect(formatScorecardProfileValue('NPS', -12)).toBe('-12');
        });
    });
});
