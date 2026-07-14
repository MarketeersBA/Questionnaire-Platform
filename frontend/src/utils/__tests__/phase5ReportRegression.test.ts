/**
 * Phase 5 — consolidated frontend regression for brand comparison + scorecard fixes.
 *
 * OL/PI constants mirror backend fixture:
 * `backend/tests/analytics/fixtures/ice_cream_survey.py`
 * (Friday OL=5.0, Squizz OL=6.0; PI T2B Friday=90%, Squizz=100%).
 */

import { describe, expect, it } from 'vitest';
import { buildBrandComparisonChartRows, resolveBrandComparisonSeries } from '../brandComparisonSeries';
import { buildChartCsvTabular } from '../chartCsvExport';
import {
    BRAND_STRATEGIC_COMPARISON_ALT_LABELS,
    BRAND_STRATEGIC_COMPARISON_CHART,
} from '../chartCsvExport/__tests__/fixtures';
import { filterWebScorecardProfile } from '../scorecardProfile';

const ICE_CREAM_PI = [90.0, 100.0];
/** Matches backend EXPECTED_OL_MEAN: Friday=5.0, Squizz=6.0 (label order Friday, Squizz). */
const ICE_CREAM_OL = [5.0, 6.0];
const ICE_CREAM_BRANDS = ['Friday', 'Squizz'];

const ICE_CREAM_BRAND_CARD_PROFILE = {
    Brand: 'Friday',
    'Overall Score': 4.25,
    'T2B %': 2.7,
    Evaluations: 260,
};

describe('Phase 5 — report regression (frontend)', () => {
    describe('brand comparison series resolver', () => {
        it('resolves canonical ice cream payload with both brands and non-zero PI', () => {
            const resolved = resolveBrandComparisonSeries(BRAND_STRATEGIC_COMPARISON_CHART.data);
            expect(resolved.labels).toEqual(ICE_CREAM_BRANDS);
            expect(resolved.purchaseIntent).toEqual(ICE_CREAM_PI);
            expect(resolved.likability).toEqual(ICE_CREAM_OL);
            expect(resolved.purchaseIntent.every((v) => v > 0)).toBe(true);
            expect(resolved.likabilityDomain).toEqual([1, 7]);
        });

        it('handles alternate PI labels without hiding values as zero', () => {
            const rows = buildBrandComparisonChartRows(BRAND_STRATEGIC_COMPARISON_ALT_LABELS.data);
            expect(rows).toHaveLength(2);
            expect(rows[0]).toMatchObject({ name: 'Friday', pi: 90, ol: 5 });
            expect(rows[1]).toMatchObject({ name: 'Squizz', pi: 100, ol: 6 });
        });
    });

    describe('brand comparison CSV pipeline', () => {
        it('exports both brands with PI and likability columns at N=10', () => {
            const tabular = buildChartCsvTabular(BRAND_STRATEGIC_COMPARISON_CHART);
            expect(tabular?.source).toBe('brand_comparison');
            expect(tabular?.columns.map((c) => c.header)).toEqual([
                'Label',
                'Purchase Intent (T2B%)',
                'Overall Likability',
            ]);
            expect(tabular?.rows).toEqual([
                { label: 'Friday', purchase_intent: 90, overall_likability: 5 },
                { label: 'Squizz', purchase_intent: 100, overall_likability: 6 },
            ]);
        });
    });

    describe('brand profile scorecard (web)', () => {
        it('hides Evaluations while preserving other profile metrics', () => {
            const visible = filterWebScorecardProfile(ICE_CREAM_BRAND_CARD_PROFILE);
            expect(visible.map(([k]) => k)).toEqual(['Brand', 'Overall Score', 'T2B %']);
            expect(visible.some(([k]) => k.toLowerCase() === 'evaluations')).toBe(false);
        });
    });
});
