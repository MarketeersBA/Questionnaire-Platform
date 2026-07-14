import { describe, expect, it } from 'vitest';
import {
    PACKAGING_HEATMAP_GRID_SIZE,
    binClick,
    gaussianBlurGrid,
    maxBinValue,
    topHotspotQuadrant,
} from './packagingHeatmapAnalytics';

describe('packagingHeatmapAnalytics', () => {
    it('binClick mirrors backend bin_click', () => {
        expect(binClick(0, 0)).toBe(0);
        expect(binClick(0.5, 0.5)).toBe(16 * PACKAGING_HEATMAP_GRID_SIZE + 16);
    });

    it('gaussianBlurGrid smooths isolated peaks', () => {
        const bins = Array(PACKAGING_HEATMAP_GRID_SIZE * PACKAGING_HEATMAP_GRID_SIZE).fill(0);
        bins[0] = 10;
        const blurred = gaussianBlurGrid(bins);
        expect(blurred[0]).toBeGreaterThan(0);
        expect(blurred[1]).toBeGreaterThan(0);
        expect(maxBinValue(blurred)).toBeLessThanOrEqual(10);
    });

    it('topHotspotQuadrant resolves quadrant label', () => {
        const bins = Array(PACKAGING_HEATMAP_GRID_SIZE * PACKAGING_HEATMAP_GRID_SIZE).fill(0);
        const peakIdx = 2 * PACKAGING_HEATMAP_GRID_SIZE + 2;
        bins[peakIdx] = 5;
        const hotspot = topHotspotQuadrant(bins);
        expect(hotspot?.quadrant).toBe('top-left');
        expect(hotspot?.label).toBe('Top Left');
    });
});
