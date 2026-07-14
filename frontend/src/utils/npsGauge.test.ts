import { describe, expect, it } from 'vitest';
import {
    extractNpsGaugeBrands,
    formatNpsGaugeScore,
    formatSignedNps,
    getNpsScoreBadgeClasses,
    hasNpsGaugeData,
    normalizeSegmentPercent,
    npsScoreTone,
} from './npsGauge';

const CANONICAL_PAYLOAD = {
    labels: ['Friday', 'Squizz'],
    datasets: [
        { label: 'Detractors', data: [0.6, 0.7] },
        { label: 'Passives', data: [0.3, 0.3] },
        { label: 'Promoters', data: [0.1, 0.0] },
    ],
    nps_scores: { Friday: -50, Squizz: -70 },
    segments: [
        { brand: 'Friday', nps: -50, detractors_pct: 60, passives_pct: 30, promoters_pct: 10 },
        { brand: 'Squizz', nps: -70, detractors_pct: 70, passives_pct: 30, promoters_pct: 0 },
    ],
};

describe('npsGauge utilities', () => {
    describe('normalizeSegmentPercent', () => {
        it.each([
            [0.6, 60],
            [0.125, 12.5],
            [60, 60],
            [120, 100],
            [-1, 0],
            ['bad', 0],
        ])('normalizes %s to %s', (value, expected) => {
            expect(normalizeSegmentPercent(value)).toBe(expected);
        });
    });

    describe('formatSignedNps / formatNpsGaugeScore', () => {
        it.each([
            [30, '+30'],
            [-50, '-50'],
            [0, '0'],
        ])('formats signed NPS %s as %s', (value, expected) => {
            expect(formatSignedNps(value)).toBe(expected);
            expect(formatNpsGaugeScore(value)).toBe(expected);
        });

        it('returns N/A for missing scores', () => {
            expect(formatNpsGaugeScore(null)).toBe('N/A');
            expect(formatNpsGaugeScore(undefined)).toBe('N/A');
        });
    });

    describe('npsScoreTone', () => {
        it.each([
            [60, 'strong'],
            [50, 'strong'],
            [10, 'neutral'],
            [0, 'neutral'],
            [-1, 'negative'],
            [-70, 'negative'],
            [null, 'unknown'],
        ])('grades %s as %s', (score, expected) => {
            expect(npsScoreTone(score)).toBe(expected);
        });
    });

    describe('getNpsScoreBadgeClasses', () => {
        it('returns tone-specific classes', () => {
            expect(getNpsScoreBadgeClasses(60, true)).toContain('emerald');
            expect(getNpsScoreBadgeClasses(10, false)).toContain('slate');
            expect(getNpsScoreBadgeClasses(-20, true)).toContain('rose');
            expect(getNpsScoreBadgeClasses(null, false)).toContain('slate');
        });
    });

    describe('extractNpsGaugeBrands', () => {
        it('extracts canonical multi-brand payloads with fraction segments', () => {
            const rows = extractNpsGaugeBrands(CANONICAL_PAYLOAD);

            expect(rows).toHaveLength(2);
            expect(rows[0]).toEqual({
                brand: 'Friday',
                detractors: 60,
                passives: 30,
                promoters: 10,
                nps: -50,
            });
            expect(rows[1]).toEqual({
                brand: 'Squizz',
                detractors: 70,
                passives: 30,
                promoters: 0,
                nps: -70,
            });
        });

        it('accepts percent-valued canonical datasets', () => {
            const rows = extractNpsGaugeBrands({
                labels: ['Hero Brand'],
                datasets: [
                    { label: 'Detractors', data: [20] },
                    { label: 'Passives', data: [30] },
                    { label: 'Promoters', data: [50] },
                ],
                nps_scores: { 'Hero Brand': 30 },
            });

            expect(rows).toEqual([
                {
                    brand: 'Hero Brand',
                    detractors: 20,
                    passives: 30,
                    promoters: 50,
                    nps: 30,
                },
            ]);
        });

        it('transposes legacy segment-row payloads to brand rows', () => {
            const rows = extractNpsGaugeBrands({
                labels: ['Promoters_Pct', 'Passives_Pct', 'Detractors_Pct'],
                datasets: [
                    { label: 'Own Brand', data: [0.5, 0.3, 0.2] },
                    { label: 'Competitor A', data: [0.4, 0.4, 0.2] },
                ],
            });

            expect(rows).toEqual([
                {
                    brand: 'Own Brand',
                    detractors: 20,
                    passives: 30,
                    promoters: 50,
                    nps: null,
                },
                {
                    brand: 'Competitor A',
                    detractors: 20,
                    passives: 40,
                    promoters: 40,
                    nps: null,
                },
            ]);
        });

        it('supports legacy flat single-brand payloads', () => {
            const rows = extractNpsGaugeBrands({
                nps: 42,
                detractors: 0.1,
                passives: 0.2,
                promoters: 0.7,
            });

            expect(rows).toEqual([
                {
                    brand: 'Overall',
                    detractors: 10,
                    passives: 20,
                    promoters: 70,
                    nps: 42,
                },
            ]);
        });

        it('returns empty array for invalid payloads', () => {
            expect(extractNpsGaugeBrands(null)).toEqual([]);
            expect(extractNpsGaugeBrands({})).toEqual([]);
            expect(extractNpsGaugeBrands({ labels: [], datasets: [] })).toEqual([]);
        });
    });

    describe('hasNpsGaugeData', () => {
        it('detects renderable gauge payloads', () => {
            expect(hasNpsGaugeData(CANONICAL_PAYLOAD)).toBe(true);
            expect(hasNpsGaugeData(null)).toBe(false);
        });
    });
});
