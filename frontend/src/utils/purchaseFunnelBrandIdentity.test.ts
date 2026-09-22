import { describe, it, expect } from 'vitest';
import {
    isArabicText,
    brandFromTypedName,
    findMatchingBrand,
    mergeBrandName,
    addBrandName,
} from './purchaseFunnelBrandIdentity';

/**
 * A funnel brand used to be stored as `{ name_en: typed, name_ar: typed }` —
 * whatever was typed, copied into both fields verbatim — and duplicate
 * checking only ever compared `name_en` with an exact, case-sensitive match.
 * So an English brand's `name_ar` field held English text, an Arabic-typed
 * entry's `name_en` held Arabic text, and "Pepsi" / "pepsi" / a brand already
 * known from the taste test all became separate entries.
 */
describe('isArabicText', () => {
    it('tells Arabic and Latin script apart', () => {
        expect(isArabicText('بيبسي')).toBe(true);
        expect(isArabicText('Pepsi')).toBe(false);
        expect(isArabicText('')).toBe(false);
    });
});

describe('brandFromTypedName', () => {
    it('files an Arabic name under name_ar, not both fields', () => {
        expect(brandFromTypedName('بيبسي')).toEqual({ name_en: '', name_ar: 'بيبسي' });
    });

    it('files an English name under name_en, not both fields', () => {
        expect(brandFromTypedName('Pepsi')).toEqual({ name_en: 'Pepsi', name_ar: '' });
    });
});

describe('findMatchingBrand', () => {
    const list = [
        { name_en: 'Pepsi', name_ar: '' },
        { name_en: '', name_ar: 'كوكاكولا' },
    ];

    it('matches case- and whitespace-insensitively on name_en', () => {
        expect(findMatchingBrand(list, '  pepsi ')).toBe(list[0]);
    });

    it('matches on name_ar too, not only name_en', () => {
        // The exact-match-on-name_en-only check this replaces would miss this
        // entirely, since list[1].name_en is empty.
        expect(findMatchingBrand(list, 'كوكاكولا')).toBe(list[1]);
    });

    it('returns undefined for a genuinely new brand', () => {
        expect(findMatchingBrand(list, 'Sprite')).toBeUndefined();
    });

    it('does not match on an empty candidate', () => {
        expect(findMatchingBrand(list, '  ')).toBeUndefined();
    });
});

describe('mergeBrandName', () => {
    it('fills in the missing Arabic name without touching the English one', () => {
        const brand = { name_en: 'Pepsi', name_ar: '' };
        expect(mergeBrandName(brand, 'بيبسي')).toEqual({ name_en: 'Pepsi', name_ar: 'بيبسي' });
    });

    it('fills in the missing English name without touching the Arabic one', () => {
        const brand = { name_en: '', name_ar: 'بيبسي' };
        expect(mergeBrandName(brand, 'Pepsi')).toEqual({ name_en: 'Pepsi', name_ar: 'بيبسي' });
    });

    it('never overwrites a field that is already filled in', () => {
        const brand = { name_en: 'Pepsi', name_ar: 'بيبسي القديم' };
        expect(mergeBrandName(brand, 'بيبسي')).toEqual(brand);
    });
});

describe('addBrandName', () => {
    it('appends a genuinely new brand, split by script', () => {
        const { list, matchedExisting } = addBrandName([], 'Pepsi');
        expect(matchedExisting).toBe(false);
        expect(list).toEqual([{ name_en: 'Pepsi', name_ar: '' }]);
    });

    it('links a same-script duplicate instead of adding a second entry', () => {
        const start = [{ name_en: 'Pepsi', name_ar: '' }];
        const { list, matchedExisting } = addBrandName(start, 'pepsi');
        expect(matchedExisting).toBe(true);
        expect(list).toHaveLength(1);
    });

    it('links an Arabic name onto an existing English-only entry rather than duplicating', () => {
        // This is the reported bug: the creator typed "Pepsi" for the taste
        // test (or funnel), then later "بيبسي" for the same brand. Once
        // *something* has associated the two — synced from architecture, or
        // typed once already as a pair — adding the other script again must
        // not create a second brand.
        const start = [{ name_en: 'Pepsi', name_ar: 'بيبسي' }];
        const { list, matchedExisting } = addBrandName(start, 'بيبسي');
        expect(matchedExisting).toBe(true);
        expect(list).toEqual(start);
    });

    it('does nothing for a blank name', () => {
        const start = [{ name_en: 'Pepsi', name_ar: '' }];
        const { list, matchedExisting } = addBrandName(start, '   ');
        expect(matchedExisting).toBe(false);
        expect(list).toBe(start);
    });

    it('links a brand typed independently in the other script — the case this used to be unable to solve', () => {
        // "Squizz" typed once (taste test), "سكويز" typed completely
        // separately (funnel) — nothing else ever associated the two. Exact
        // matching alone can't see they're the same; the phonetic fallback
        // in findMatchingBrand can.
        const start = [{ name_en: 'Squizz', name_ar: '' }];
        const { list, matchedExisting } = addBrandName(start, 'سكويز');

        expect(matchedExisting).toBe(true);
        expect(list).toEqual([{ name_en: 'Squizz', name_ar: 'سكويز' }]);
    });

    it('the reverse direction works too — Arabic added first, English typed later', () => {
        const start = [{ name_en: '', name_ar: 'بيبسي' }];
        const { list, matchedExisting } = addBrandName(start, 'Pepsi');

        expect(matchedExisting).toBe(true);
        expect(list).toEqual([{ name_en: 'Pepsi', name_ar: 'بيبسي' }]);
    });
});
