import { describe, it, expect } from 'vitest';
import {
    buildBrandComparisonChartRows,
    classifyBrandComparisonDataset,
    normalizePurchaseIntentPercent,
    pickBrandComparisonDataset,
    resolveBrandComparisonSeries,
} from './brandComparisonSeries';

const ICE_CREAM_PAYLOAD = {
    labels: ['Friday', 'Squizz'],
    datasets: [
        { label: 'Purchase Intent (T2B%)', data: [90.0, 100.0], unit: '%' },
        { label: 'Overall Likability', data: [5.0, 6.0], unit: 'score' },
    ],
    metadata: {
        y_axis_left: { label: 'Purchase Intent', unit: '%', domain: [0, 100] },
        y_axis_right: { label: 'Likability Score', unit: '1-7', domain: [1, 7] },
    },
};

describe('brandComparisonSeries', () => {
    describe('normalizePurchaseIntentPercent', () => {
        it('scales 0–1 ratios to percent', () => {
            expect(normalizePurchaseIntentPercent(0.9)).toBe(90);
            expect(normalizePurchaseIntentPercent(1)).toBe(100);
        });

        it('keeps whole-number percentages', () => {
            expect(normalizePurchaseIntentPercent(90, '%')).toBe(90);
        });
    });

    describe('classifyBrandComparisonDataset', () => {
        it('recognizes canonical and alternate PI labels', () => {
            expect(classifyBrandComparisonDataset({ label: 'Purchase Intent (T2B%)' })).toBe('purchase_intent');
            expect(classifyBrandComparisonDataset({ label: 'Intent T2B%' })).toBe('purchase_intent');
            expect(classifyBrandComparisonDataset({ label: 'PI T2B' })).toBe('purchase_intent');
        });

        it('recognizes likability labels', () => {
            expect(classifyBrandComparisonDataset({ label: 'Overall Likability' })).toBe('likability');
            expect(classifyBrandComparisonDataset({ label: 'Brand Affinity Score', unit: 'score' })).toBe(
                'likability',
            );
        });
    });

    describe('resolveBrandComparisonSeries', () => {
        it('resolves ice cream N=10 payload with both brands', () => {
            const resolved = resolveBrandComparisonSeries(ICE_CREAM_PAYLOAD);
            expect(resolved.labels).toEqual(['Friday', 'Squizz']);
            expect(resolved.purchaseIntent).toEqual([90, 100]);
            expect(resolved.likability).toEqual([5, 6]);
            expect(resolved.likabilityDomain).toEqual([1, 7]);
        });

        it('resolves alternate PI label and ratio values', () => {
            const resolved = resolveBrandComparisonSeries({
                labels: ['Friday', 'Squizz'],
                datasets: [
                    { label: 'Intent T2B%', data: [0.9, 1.0] },
                    { label: 'Likability', data: [5.0, 6.0] },
                ],
            });
            expect(resolved.purchaseIntent).toEqual([90, 100]);
            expect(resolved.likability).toEqual([5, 6]);
        });

        it('does not hide PI when only label differs from Purchase Intent substring', () => {
            const rows = buildBrandComparisonChartRows({
                labels: ['A', 'B'],
                datasets: [
                    { label: 'PI T2B', data: [55, 72] },
                    { label: 'Sentiment', data: [4.1, 4.8] },
                ],
            });
            expect(rows[0].pi).toBe(55);
            expect(rows[1].pi).toBe(72);
        });
    });

    describe('pickBrandComparisonDataset', () => {
        it('picks distinct datasets for PI and likability', () => {
            const datasets = ICE_CREAM_PAYLOAD.datasets;
            const pi = pickBrandComparisonDataset(datasets, 'purchase_intent', ICE_CREAM_PAYLOAD.metadata);
            const ol = pickBrandComparisonDataset(
                datasets,
                'likability',
                ICE_CREAM_PAYLOAD.metadata,
                new Set(pi ? [pi.index] : []),
            );
            expect(pi?.index).toBe(0);
            expect(ol?.index).toBe(1);
        });
    });
});
