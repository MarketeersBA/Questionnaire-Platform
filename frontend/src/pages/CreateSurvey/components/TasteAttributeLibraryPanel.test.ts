import { describe, it, expect } from 'vitest';
import { scaleBadge } from './TasteAttributeLibraryPanel';

/**
 * The badge tells the analyst what scale a respondent will be shown, so it has
 * to read the question's own range. It previously carried fixed strings
 * ("Ladder 1-5", "Centered 1-5"), which meant a question moved to 1-10 went on
 * being advertised as 1-5 — the picker and the live survey disagreed, and only
 * the picker was visible at design time.
 */
const base = {
    question_id: 'q',
    sub_attribute: null,
    text: '',
    question_type: 'scale 1-10',
    point_labels: [] as string[],
    point_labels_ar: [] as string[],
    status: 'fixed' as const,
    ideal_point: null,
};

describe('scaleBadge', () => {
    it('reports the range the question actually declares', () => {
        const badge = scaleBadge({
            ...base,
            scale_shape: 'monotonic',
            scale_min: 1,
            scale_max: 10,
        });
        expect(badge.label).toBe('Ladder 1-10 · high is best');
        expect(badge.label).not.toContain('1-5');
    });

    it('does not assume every centered scale is 1-5', () => {
        expect(
            scaleBadge({ ...base, scale_shape: 'centered', scale_min: 1, scale_max: 7 }).label,
        ).toBe('Centered 1-7 · middle is ideal');
    });

    it('keeps the midpoint-is-ideal wording only for centered scales', () => {
        expect(
            scaleBadge({ ...base, scale_shape: 'hedonic', scale_min: 1, scale_max: 10 }).label,
        ).toBe('Liking 1-10 · high is best');
    });

    it('omits a range for shapes that have none', () => {
        expect(
            scaleBadge({ ...base, scale_shape: 'open_end', scale_min: 0, scale_max: 0 }).label,
        ).toBe('Open end');
        expect(
            scaleBadge({ ...base, scale_shape: 'bipolar', scale_min: 1, scale_max: 5 }).label,
        ).toBe('Bipolar');
    });
});
