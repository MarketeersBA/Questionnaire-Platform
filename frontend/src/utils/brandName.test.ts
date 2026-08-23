import { describe, it, expect } from 'vitest';
import { formatBrandName, formatBrandNames } from './brandName';

describe('formatBrandName', () => {
    it('strips the Arabic marker-shape suffix used in fieldwork', () => {
        expect(formatBrandName('هيرو (مثلث)')).toBe('هيرو');
        expect(formatBrandName('ابو عوف (مربع)')).toBe('ابو عوف');
    });

    it('strips the English equivalents', () => {
        expect(formatBrandName('Hero (Triangle)')).toBe('Hero');
        expect(formatBrandName('Abu Aouf (square)')).toBe('Abu Aouf');
    });

    it('keeps parentheticals that carry real meaning', () => {
        expect(formatBrandName('Hero Protein Bar (Legacy)')).toBe('Hero Protein Bar (Legacy)');
        expect(formatBrandName('Milkana (2024)')).toBe('Milkana (2024)');
        expect(formatBrandName('Cheese (Reformulated)')).toBe('Cheese (Reformulated)');
    });

    it('leaves plain names alone', () => {
        expect(formatBrandName('President')).toBe('President');
    });

    it('handles full-width brackets', () => {
        expect(formatBrandName('هيرو （مثلث）')).toBe('هيرو');
    });

    it('never returns an empty string when the name is only a shape', () => {
        // Degenerate config: nothing but the marker. Keep the original rather
        // than rendering a blank brand label.
        expect(formatBrandName('(مثلث)')).toBe('(مثلث)');
    });

    it('is safe on empty-ish input', () => {
        expect(formatBrandName('')).toBe('');
        expect(formatBrandName(null)).toBe('');
        expect(formatBrandName(undefined)).toBe('');
    });

    it('maps across a list preserving order', () => {
        expect(formatBrandNames(['هيرو (مثلث)', 'President'])).toEqual(['هيرو', 'President']);
    });
});
