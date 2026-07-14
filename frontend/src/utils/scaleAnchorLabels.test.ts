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
        expect(SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES).toContain('text-sm');
        expect(SCALE_ANCHOR_RESPONDENT_LABEL_CLASSES).toContain('md:text-base');
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
