import { describe, it, expect } from 'vitest';
import { splitPoints, condense, condensePoint, condenseAll } from './condense';

const VERBOSE =
    '1. **Taste Enhancement Initiatives**: Focus on enhancing taste attributes to close the gap with ' +
    'Abu Aouf, which leads with higher Likeness Scores. 2. **Increase Brand Awareness**: Implement ' +
    'campaigns aimed at boosting brand visibility since both brands face a critical deficit. ' +
    '3. **Leverage Shape Preference**: Hero outperforms competitors in General Shape Preference.';

describe('splitPoints', () => {
    it('splits inline enumerations into separate points', () => {
        const points = splitPoints(VERBOSE);
        expect(points).toHaveLength(3);
        expect(points[0]).toContain('Taste Enhancement Initiatives');
        expect(points[0]).not.toContain('**');
    });

    it('splits plain prose on sentence boundaries', () => {
        const points = splitPoints(
            'Hero trails on Taste Quality by a wide margin. Freshness remains its strongest attribute.',
        );
        expect(points).toHaveLength(2);
    });

    it('does not split on decimals inside figures', () => {
        const points = splitPoints('Hero scored 4.45 against a category mean of 5.29 this wave.');
        expect(points).toHaveLength(1);
    });

    it('is safe on empty input', () => {
        expect(splitPoints('')).toEqual([]);
    });
});

describe('condense', () => {
    it('caps long text on a word boundary and marks elision', () => {
        const out = condense('one two three four five six seven eight', 4);
        expect(out).toBe('one two three four…');
    });

    it('leaves short text untouched and drops trailing punctuation', () => {
        expect(condense('Freshness carries Hero.', 20)).toBe('Freshness carries Hero');
    });

    it('strips markdown markup', () => {
        expect(condense('**Critical Risks**', 20)).toBe('Critical Risks');
    });
});

describe('condensePoint', () => {
    it('prefers an inline "Label: detail" over the generic title', () => {
        const p = condensePoint('Immediate Opportunities', VERBOSE, 12);
        expect(p.label).toBe('Taste Enhancement Initiatives');
        expect(p.detail).toContain('Focus on enhancing taste');
    });

    it('falls back to the supplied label for plain prose', () => {
        const p = condensePoint('Core Market Position', 'Hero trails Abu Aouf on taste quality.', 12);
        expect(p.label).toBe('Core Market Position');
        expect(p.detail).toContain('Hero trails');
    });
});

describe('condenseAll', () => {
    it('expands a multi-point blob into separate labelled points', () => {
        const pts = condenseAll('Immediate Opportunities', VERBOSE, 3, 10);
        expect(pts).toHaveLength(3);
        expect(pts.map((p) => p.label)).toEqual([
            'Taste Enhancement Initiatives',
            'Increase Brand Awareness',
            'Leverage Shape Preference',
        ]);
        // Each detail respects the word cap.
        pts.forEach((p) => {
            expect(p.detail.replace('…', '').split(' ').length).toBeLessThanOrEqual(10);
        });
    });

    it('honours the limit', () => {
        expect(condenseAll('x', VERBOSE, 2)).toHaveLength(2);
    });

    it('returns a single point for plain prose', () => {
        expect(condenseAll('Label', 'A short single observation about taste.', 3)).toHaveLength(1);
    });

    it('returns nothing for empty bodies', () => {
        expect(condenseAll('Label', '', 3)).toEqual([]);
    });
});
