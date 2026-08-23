import { describe, it, expect } from 'vitest';
import { splitEnumerated, toPlainText } from './richText';

describe('splitEnumerated', () => {
    it('splits the inline enumerations the AI emits into separate points', () => {
        const raw =
            '1. **Taste Enhancement Initiatives**: Focus on enhancing taste attributes. ' +
            '2. **Increase Brand Awareness**: Implement campaigns. ' +
            '3. **Leverage Shape Preference**: Hero outperforms competitors.';
        const items = splitEnumerated(raw);
        expect(items).toHaveLength(3);
        expect(items[0]).toContain('Taste Enhancement Initiatives');
        expect(items[2]).toContain('Leverage Shape Preference');
        // Leading "N." markers are consumed, not left in the text.
        expect(items.some((i) => /^\d+\./.test(i))).toBe(false);
    });

    it('leaves ordinary prose as a single item', () => {
        const raw = 'Hero trails Abu Aouf by 18 points on Taste Quality.';
        expect(splitEnumerated(raw)).toEqual([raw]);
    });

    it('does not split on a lone numeric marker inside a sentence', () => {
        const raw = 'Scores rose 1. 5 points across the wave.';
        expect(splitEnumerated(raw)).toHaveLength(1);
    });

    it('handles empty input safely', () => {
        expect(splitEnumerated('')).toEqual([]);
        expect(splitEnumerated(undefined as unknown as string)).toEqual([]);
    });
});

describe('toPlainText', () => {
    it('removes markdown markup for export surfaces', () => {
        expect(toPlainText('**Purchase Intent Challenges**: low intent'))
            .toBe('Purchase Intent Challenges: low intent');
    });

    it('collapses whitespace', () => {
        expect(toPlainText('a   b\n\nc')).toBe('a b c');
    });

    it('is safe on empty input', () => {
        expect(toPlainText('')).toBe('');
    });
});
