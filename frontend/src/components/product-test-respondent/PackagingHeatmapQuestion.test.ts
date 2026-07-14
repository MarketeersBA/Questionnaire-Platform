import { describe, expect, it } from 'vitest';
import { pointerToNormalizedCoords } from './PackagingHeatmapQuestion';

describe('pointerToNormalizedCoords', () => {
    it('maps center of object-contain image to ~0.5,0.5', () => {
        const img = {
            naturalWidth: 400,
            naturalHeight: 200,
            getBoundingClientRect: () => ({
                left: 0,
                top: 0,
                width: 200,
                height: 200,
                right: 200,
                bottom: 200,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        } as HTMLImageElement;

        const coords = pointerToNormalizedCoords(100, 100, img);
        expect(coords).not.toBeNull();
        expect(coords!.x).toBeCloseTo(0.5, 1);
        expect(coords!.y).toBeCloseTo(0.5, 1);
    });

    it('clamps clicks outside the image box to the nearest edge', () => {
        const img = {
            naturalWidth: 400,
            naturalHeight: 200,
            getBoundingClientRect: () => ({
                left: 0,
                top: 0,
                width: 200,
                height: 200,
                right: 200,
                bottom: 200,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        } as HTMLImageElement;

        // X=5 is outside the image (the letterboxing covers 0..200 with object-contain offset)
        // Wait, the letterboxing for 400x200 inside 200x200 means scale=0.5
        // displayW = 200, displayH = 100
        // offsetY = 50. So image takes up local Y from 50 to 150. local X from 0 to 200.
        // So clicking clientX=5, clientY=5 -> localX=5, localY=-45 -> clamped y=0, x=0.025
        const c1 = pointerToNormalizedCoords(5, 5, img);
        expect(c1).not.toBeNull();
        expect(c1!.x).toBeCloseTo(0.025, 2);
        expect(c1!.y).toBe(0);

        // Click strictly below
        const c2 = pointerToNormalizedCoords(100, 180, img);
        expect(c2).not.toBeNull();
        expect(c2!.x).toBeCloseTo(0.5, 2);
        expect(c2!.y).toBe(1); // bottom clamped
    });
});
