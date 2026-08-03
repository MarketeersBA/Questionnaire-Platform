import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    readScaleDragHintDismissed,
    persistScaleDragHintDismissed,
    resolveTrackPaddingForSize,
    SCALE_DRAG_HINT_STORAGE_KEY,
    HORIZONTAL_SCALE_SLIDER_TIERS,
} from './horizontalScaleSliderConfig';

describe('horizontalScaleSliderConfig', () => {
    beforeEach(() => {
        const store: Record<string, string> = {};
        vi.stubGlobal('sessionStorage', {
            getItem(key: string) {
                return store[key] ?? null;
            },
            setItem(key: string, value: string) {
                store[key] = value;
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('exposes distinct default and large tiers', () => {
        expect(HORIZONTAL_SCALE_SLIDER_TIERS.large.thumbHalfPx).toBeGreaterThan(
            HORIZONTAL_SCALE_SLIDER_TIERS.default.thumbHalfPx,
        );
        expect(HORIZONTAL_SCALE_SLIDER_TIERS.large.trackPadding.left).toBe(16);
        expect(HORIZONTAL_SCALE_SLIDER_TIERS.default.trackPadding.left).toBe(8);
    });

    it('resolves track padding for responsive large size', () => {
        expect(resolveTrackPaddingForSize('large', false)).toEqual({ left: 16, right: 16 });
        expect(resolveTrackPaddingForSize('large', true)).toEqual({ left: 8, right: 8 });
        expect(resolveTrackPaddingForSize('default', false)).toEqual({ left: 8, right: 8 });
    });

    it('persists hint dismissal in sessionStorage', () => {
        expect(readScaleDragHintDismissed()).toBe(false);
        persistScaleDragHintDismissed();
        expect(sessionStorage.getItem(SCALE_DRAG_HINT_STORAGE_KEY)).toBe('1');
        expect(readScaleDragHintDismissed()).toBe(true);
    });
});
