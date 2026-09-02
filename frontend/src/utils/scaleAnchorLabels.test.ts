import { describe, expect, it } from 'vitest';
import {
    formatLinearScaleAnchor,
    resolveScaleAnchorDefaults,
    resolveScaleAnchorLabels,
    SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES,
    buildScaleRangeAriaLabel,
    buildScaleRangeAriaValueText,
} from './scaleAnchorLabels';

describe('scaleAnchorLabels', () => {
    it('formats linear anchors with dot separator', () => {
        expect(formatLinearScaleAnchor(1, 'وحش', 'dot')).toBe('1 · وحش');
        expect(formatLinearScaleAnchor(5, 'حلو', 'dot')).toBe('5 · حلو');
    });

    it('formats linear anchors with dash separator', () => {
        expect(formatLinearScaleAnchor(1, 'Not at all', 'dash')).toBe('1 - Not at all');
    });

    it('resolves Arabic bipolar domain labels', () => {
        const resolved = resolveScaleAnchorLabels({
            language: 'ar',
            variant: 'bipolar',
            minLabel: 'وحش',
            maxLabel: 'حلو',
        });
        expect(resolved).toEqual({
            leftText: 'وحش',
            rightText: 'حلو',
            direction: 'rtl',
        });
    });

    it('resolves English linear defaults when labels omitted', () => {
        const defaults = resolveScaleAnchorDefaults('en');
        const resolved = resolveScaleAnchorLabels({
            language: 'en',
            variant: 'linear',
            scaleMax: 10,
        });
        expect(resolved.leftText).toBe(`1 · ${defaults.minLabel}`);
        expect(resolved.rightText).toBe(`10 · ${defaults.maxLabel}`);
        expect(resolved.direction).toBe('ltr');
    });

    it('keeps Arabic linear scale direction aligned with slider (ltr)', () => {
        const resolved = resolveScaleAnchorLabels({
            language: 'ar',
            variant: 'linear',
            minLabel: 'ليس على الإطلاق',
            maxLabel: 'للغاية',
            scaleMax: 5,
        });
        expect(resolved.leftText).toContain('1');
        expect(resolved.rightText).toContain('5');
        expect(resolved.direction).toBe('ltr');
    });

    it('prefers explicit bipolar left/right labels', () => {
        const resolved = resolveScaleAnchorLabels({
            language: 'en',
            variant: 'bipolar',
            leftLabel: 'Dislike',
            rightLabel: 'Like',
            minLabel: 'ignored-min',
            maxLabel: 'ignored-max',
        });
        expect(resolved.leftText).toBe('Dislike');
        expect(resolved.rightText).toBe('Like');
    });

    it('uses readable responsive label classes without uppercase tracking', () => {
        expect(SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES).toContain('text-xs');
        expect(SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES).toContain('md:text-sm');
        expect(SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES).toContain('text-slate-600');
        expect(SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES).not.toContain('text-[10px]');
        expect(SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES).not.toContain('uppercase');
        expect(SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES).not.toContain('tracking-widest');
    });

    it('builds RTL-friendly aria labels for Arabic domain anchors', () => {
        const label = buildScaleRangeAriaLabel({
            language: 'ar',
            scaleMax: 5,
            minLabel: 'وحش',
            maxLabel: 'حلو',
        });
        expect(label).toContain('وحش');
        expect(label).toContain('حلو');
        expect(buildScaleRangeAriaValueText(3, 5, 'ar')).toBe('القيمة 3 من 5');
    });
});

/**
 * Per-point labels: the mechanism that replaced inferring a "JAR" scale from
 * its length. The labels state what each answer means, so a sensory midpoint
 * reads as ideal while a purchase-intent midpoint does not.
 */
describe('scaleAnchorLabels — per-point labels', () => {
    const SALTY = ['مش مملح كفاية', 'مش مملح', 'مناسب لى', 'مملح', 'مملح جدا'];

    it('returns one point per label with the ideal marked', () => {
        const resolved = resolveScaleAnchorLabels({
            language: 'ar',
            scaleMin: 1,
            scaleMax: 5,
            pointLabels: SALTY,
            idealPoint: 3,
        });

        expect(resolved.points).toHaveLength(5);
        expect(resolved.points?.map((p) => p.value)).toEqual([1, 2, 3, 4, 5]);
        expect(resolved.points?.map((p) => p.text)).toEqual(SALTY);
        expect(resolved.points?.filter((p) => p.isIdeal).map((p) => p.value)).toEqual([3]);
    });

    it('exposes the ideal label as the middle anchor', () => {
        const resolved = resolveScaleAnchorLabels({
            language: 'ar',
            pointLabels: SALTY,
            idealPoint: 3,
        });
        expect(resolved.middleText).toBe('مناسب لى');
        expect(resolved.leftText).toBe('مش مملح كفاية');
        expect(resolved.rightText).toBe('مملح جدا');
    });

    it('marks the top as ideal for a monotonic ladder, not the midpoint', () => {
        // Purchase intent is 1-5 like a sensory scale but 5 is genuinely best.
        const intent = ['مش هاشتريه خالص', 'مش هشتريه', 'هشتريه الى حد ما', 'هشتريه', 'هشتريه جدا'];
        const resolved = resolveScaleAnchorLabels({
            language: 'ar',
            pointLabels: intent,
            idealPoint: 5,
        });

        expect(resolved.points?.filter((p) => p.isIdeal).map((p) => p.value)).toEqual([5]);
        expect(resolved.points?.find((p) => p.value === 3)?.isIdeal).toBe(false);
    });

    it('point labels win over the legacy jar variant', () => {
        const resolved = resolveScaleAnchorLabels({
            language: 'ar',
            variant: 'jar',
            pointLabels: SALTY,
            idealPoint: 3,
        });
        // Not the generic قليل جداً / مناسب / كثير جداً defaults.
        expect(resolved.leftText).toBe('مش مملح كفاية');
        expect(resolved.points).toHaveLength(5);
    });

    it('ignores a label set that does not match the scale length', () => {
        const resolved = resolveScaleAnchorLabels({
            language: 'ar',
            scaleMin: 1,
            scaleMax: 10,
            pointLabels: SALTY, // only 5 labels for a 10-point scale
        });
        expect(resolved.points).toBeUndefined();
    });

    it('falls back to anchors when no labels are supplied', () => {
        const resolved = resolveScaleAnchorLabels({
            language: 'en',
            scaleMin: 1,
            scaleMax: 10,
            minLabel: 'Do not like it at all',
            maxLabel: 'Like it very much',
        });
        expect(resolved.points).toBeUndefined();
        expect(resolved.rightText).toContain('Like it very much');
    });

    it('no longer swallows author anchors on a legacy jar scale', () => {
        // The jar branch previously read only leftLabel/rightLabel, which the
        // slider never forwards, so minLabel/maxLabel were silently discarded.
        const resolved = resolveScaleAnchorLabels({
            language: 'en',
            variant: 'jar',
            minLabel: 'Not salty enough',
            maxLabel: 'Far too salty',
        });
        expect(resolved.leftText).toContain('Not salty enough');
        expect(resolved.rightText).toContain('Far too salty');
    });
});
