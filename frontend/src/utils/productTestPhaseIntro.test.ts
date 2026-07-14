import { describe, expect, it } from 'vitest';
import {
    computeProductTestProgress,
    getProductTestPhaseIntro,
} from './productTestPhaseIntro';

describe('productTestPhaseIntro', () => {
    it('returns localized intro copy for each timing phase', () => {
        const en = getProductTestPhaseIntro('before_use', 'en');
        expect(en.title).toBe('Before Use');
        expect(en.body.length).toBeGreaterThan(10);

        const ar = getProductTestPhaseIntro('during_use', 'ar');
        expect(ar.title).toBe('أثناء الاستخدام');
    });

    it('substitutes brand display into phase intro copy', () => {
        const intro = getProductTestPhaseIntro('before_use', 'en', { brandDisplay: 'SAMPLE-A' });
        expect(intro.body).toContain('SAMPLE-A');
        expect(intro.body).not.toMatch(/\bthe product\b/i);
    });

    it('computes progress from section cursor', () => {
        const sectionsPerPhase = [2, 1];
        expect(computeProductTestProgress(2, sectionsPerPhase, 0, 0, 'intro')).toBe(0);
        expect(computeProductTestProgress(2, sectionsPerPhase, 0, 1, 'section')).toBe(33);
        expect(computeProductTestProgress(2, sectionsPerPhase, 1, 0, 'intro')).toBe(67);
        expect(computeProductTestProgress(2, sectionsPerPhase, 1, 0, 'section')).toBe(67);
    });
});
