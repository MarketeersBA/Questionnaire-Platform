import { describe, expect, it } from 'vitest';
import {
    clientXToNormalizedPosition,
    clientXToScaleValue,
    normalizedPositionToScaleValue,
    resolveTrackGeometry,
    scaleValueToNormalized,
    scaleValueToPercent,
} from './horizontalScaleMath';

/** Standard 300px-wide track at viewport x=100. */
function makeTrackRect(width = 300, left = 100) {
    return {
        left,
        top: 0,
        width,
        height: 48,
        right: left + width,
        bottom: 48,
        x: left,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect;
}

describe('horizontalScaleMath', () => {
    describe('resolveTrackGeometry', () => {
        it('shrinks interactive width by left and right padding', () => {
            const geometry = resolveTrackGeometry(makeTrackRect(300, 100), {
                left: 16,
                right: 16,
            });

            expect(geometry).toEqual({ left: 116, width: 268 });
        });

        it('never returns negative width when padding exceeds container', () => {
            const geometry = resolveTrackGeometry(makeTrackRect(20, 0), {
                left: 16,
                right: 16,
            });

            expect(geometry.width).toBe(0);
        });
    });

    describe('clientXToNormalizedPosition', () => {
        it('maps left edge to 0 and right edge to 1', () => {
            const geometry = { left: 100, width: 200 };

            expect(clientXToNormalizedPosition(100, geometry)).toBe(0);
            expect(clientXToNormalizedPosition(300, geometry)).toBe(1);
        });

        it('maps center to 0.5', () => {
            const geometry = { left: 100, width: 200 };
            expect(clientXToNormalizedPosition(200, geometry)).toBe(0.5);
        });

        it('clamps out-of-bounds clientX', () => {
            const geometry = { left: 100, width: 200 };

            expect(clientXToNormalizedPosition(50, geometry)).toBe(0);
            expect(clientXToNormalizedPosition(400, geometry)).toBe(1);
        });
    });

    describe('normalizedPositionToScaleValue', () => {
        it('snaps center to midpoint for odd-length scales', () => {
            expect(normalizedPositionToScaleValue(0.5, { min: 1, max: 5 })).toBe(3);
            expect(normalizedPositionToScaleValue(0.5, { min: 1, max: 7 })).toBe(4);
        });

        it('maps edges to min and max', () => {
            expect(normalizedPositionToScaleValue(0, { min: 1, max: 10 })).toBe(1);
            expect(normalizedPositionToScaleValue(1, { min: 1, max: 10 })).toBe(10);
        });
    });

    describe('clientXToScaleValue', () => {
        const range = { min: 1, max: 5 };

        it('maps left edge to min and right edge to max', () => {
            const rect = makeTrackRect(200, 0);

            expect(
                clientXToScaleValue({ clientX: 0, trackRect: rect, range }),
            ).toBe(1);
            expect(
                clientXToScaleValue({ clientX: 200, trackRect: rect, range }),
            ).toBe(5);
        });

        it('maps center to midpoint snap', () => {
            const rect = makeTrackRect(200, 0);

            expect(
                clientXToScaleValue({ clientX: 100, trackRect: rect, range }),
            ).toBe(3);
        });

        it('clamps out-of-bounds pointer positions', () => {
            const rect = makeTrackRect(200, 100);

            expect(
                clientXToScaleValue({ clientX: 50, trackRect: rect, range }),
            ).toBe(1);
            expect(
                clientXToScaleValue({ clientX: 400, trackRect: rect, range }),
            ).toBe(5);
        });

        it('respects horizontal track padding (inset-x-4 ≈ 16px)', () => {
            const rect = makeTrackRect(300, 0);
            const padding = { left: 16, right: 16 };

            expect(
                clientXToScaleValue({ clientX: 16, trackRect: rect, range, padding }),
            ).toBe(1);
            expect(
                clientXToScaleValue({ clientX: 284, trackRect: rect, range, padding }),
            ).toBe(5);
            expect(
                clientXToScaleValue({ clientX: 150, trackRect: rect, range, padding }),
            ).toBe(3);
        });

        it.each([
            { max: 5, centerX: 150, expectedCenter: 3 },
            { max: 7, centerX: 150, expectedCenter: 4 },
            { max: 10, centerX: 150, expectedCenter: 6 },
        ])('handles scaleMax=$max with correct center snap', ({ max, centerX, expectedCenter }) => {
            const rect = makeTrackRect(300, 0);

            expect(
                clientXToScaleValue({
                    clientX: 0,
                    trackRect: rect,
                    range: { min: 1, max },
                }),
            ).toBe(1);
            expect(
                clientXToScaleValue({
                    clientX: 300,
                    trackRect: rect,
                    range: { min: 1, max },
                }),
            ).toBe(max);
            expect(
                clientXToScaleValue({
                    clientX: centerX,
                    trackRect: rect,
                    range: { min: 1, max },
                }),
            ).toBe(expectedCenter);
        });
    });

    describe('scaleValueToPercent', () => {
        it('maps min to 0% and max to 100%', () => {
            const range = { min: 1, max: 5 };

            expect(scaleValueToPercent(1, range)).toBe(0);
            expect(scaleValueToPercent(5, range)).toBe(100);
        });

        it('maps midpoint to 50%', () => {
            expect(scaleValueToPercent(3, { min: 1, max: 5 })).toBe(50);
        });

        it('clamps out-of-range values before converting', () => {
            expect(scaleValueToPercent(0, { min: 1, max: 5 })).toBe(0);
            expect(scaleValueToPercent(99, { min: 1, max: 5 })).toBe(100);
        });
    });

    describe('scaleValueToNormalized', () => {
        it('is the inverse of percent scaling', () => {
            const range = { min: 1, max: 7 };
            const value = 4;

            expect(scaleValueToNormalized(value, range)).toBeCloseTo(0.5, 5);
            expect(scaleValueToPercent(value, range)).toBe(50);
        });
    });
});
