import { describe, it, expect } from 'vitest';
import { isSameBrand, dedupeBrandNames, brandPhoneticSkeleton, matchTypedBrand } from './brandNameIdentity';

/**
 * The reported bug: "Squizz" (typed by the creator, taste-test brand) and
 * "سكويز" (typed separately, purchase-funnel brand) showed as two options in
 * a respondent-facing brand question instead of one.
 */
describe('isSameBrand — real transliterations that must match', () => {
    it.each([
        ['Squizz', 'سكويز'],       // the exact reported case
        ['Pepsi', 'بيبسي'],
        ['Vodafone', 'فودافون'],
        ['Lipton', 'ليبتون'],
        ['Nestle', 'نستله'],
        ['Cola', 'كولا'],
        ['Kiri', 'كيري'],
        ['Obour', 'أبور'],
        ['Domty', 'دومتي'],
        ['Nescafe', 'نسكافيه'],
    ])('%s === %s', (en, ar) => {
        expect(isSameBrand(en, ar)).toBe(true);
    });

    it('matches with or without the Arabic definite article "ال"', () => {
        // "عبور" and "العبور" are both just "Obour" — the article is
        // grammatical, present or absent depending on who typed it, not part
        // of the brand's identity.
        expect(isSameBrand('Obour', 'العبور')).toBe(true);
        expect(isSameBrand('Obour', 'عبور')).toBe(true);
    });

    it('is symmetric — order does not matter', () => {
        expect(isSameBrand('سكويز', 'Squizz')).toBe(true);
    });

    it('still catches same-script differences (case, whitespace)', () => {
        expect(isSameBrand('Pepsi', 'pepsi')).toBe(true);
        expect(isSameBrand('  Pepsi ', 'Pepsi')).toBe(true);
    });
});

describe('isSameBrand — different brands that must NOT match', () => {
    it.each([
        ['Pepsi', 'Cola'],
        ['Kiri', 'Kiki'],           // short skeletons one edit apart — must not fold together
        ['KIKS', 'Squizz'],         // the third, genuinely distinct option from the report
        ['Obour', 'Maraay'],
        ['Nestle', 'Nescafe'],
        ['Pepsi', 'Sprite'],
    ])('%s !== %s', (a, b) => {
        expect(isSameBrand(a, b)).toBe(false);
    });

    it('two empty or blank names are never "the same brand"', () => {
        expect(isSameBrand('', '')).toBe(false);
        expect(isSameBrand('   ', 'Pepsi')).toBe(false);
    });
});

describe('brandPhoneticSkeleton', () => {
    it('folds Arabic letters Arabic has no distinct sound for onto the Latin substitute it routinely gets written with', () => {
        // No native Arabic "p" -> written ب (folds to the same class as "b").
        expect(brandPhoneticSkeleton('Pepsi')).toBe(brandPhoneticSkeleton('بيبسي'));
    });

    it('collapses adjacent duplicate consonants', () => {
        expect(brandPhoneticSkeleton('Squizz')).toBe(brandPhoneticSkeleton('Squiz'));
    });

    it('drops vowels and semivowels from both scripts', () => {
        expect(brandPhoneticSkeleton('aeiou')).toBe('');
        expect(brandPhoneticSkeleton('اوي')).toBe('');
    });
});

describe('dedupeBrandNames', () => {
    it('reproduces the exact reported scenario: three options collapse to two', () => {
        const tasteTestBrands = ['KIKS', 'Squizz'];
        const funnelOwnBrands = ['سكويز'];
        const merged = dedupeBrandNames(tasteTestBrands, funnelOwnBrands);

        expect(merged).toEqual(['KIKS', 'Squizz']);
    });

    it('keeps the first-seen spelling rather than dropping the brand entirely', () => {
        expect(dedupeBrandNames(['Pepsi'], ['بيبسي'])).toEqual(['Pepsi']);
        expect(dedupeBrandNames(['بيبسي'], ['Pepsi'])).toEqual(['بيبسي']);
    });

    it('merges any number of source lists, e.g. taste-test + funnel + respondent-typed "Other"', () => {
        const merged = dedupeBrandNames(
            ['Pepsi', 'Cola'],
            ['بيبسي'],           // funnel's own list, same brand as Pepsi
            ['سبرايت'],          // a respondent's "Other" answer, genuinely new
        );
        expect(merged).toEqual(['Pepsi', 'Cola', 'سبرايت']);
    });

    it('ignores blank/whitespace-only entries', () => {
        expect(dedupeBrandNames(['Pepsi', '', '   '], undefined)).toEqual(['Pepsi']);
    });

    it('handles an empty call with no lists at all', () => {
        expect(dedupeBrandNames()).toEqual([]);
    });
});

/**
 * Same-script brands must never merge. These are real pairs that sit in one
 * Egyptian study and reduce to the same consonant skeleton — the phonetic
 * comparison cannot separate them, so dedupe must not consult it within a
 * single script. While it did, the two brands became one option: a respondent
 * could not pick one of them at all, and its answers were credited to the other.
 */
describe('dedupeBrandNames — two real brands must stay two options', () => {
    it.each([
        ['Almarai', 'Lamar'],      // both LMR
        ['Juhayna', 'Johnny'],     // both GHN
        ['Mirinda', 'Miranda'],    // both MRND
        ['Faragello', 'Farghaly'],
    ])('keeps %s and %s separate', (a, b) => {
        expect(dedupeBrandNames([a, b])).toEqual([a, b]);
        // also across the two source lists they arrive on in a real survey
        expect(dedupeBrandNames([a], [b])).toEqual([a, b]);
    });

    it('still collapses one brand written in both scripts', () => {
        expect(dedupeBrandNames(['Squizz'], ['سكويز'])).toEqual(['Squizz']);
    });

    it('handles the full reported case: 4 names in, 3 options out', () => {
        expect(dedupeBrandNames(['Almarai', 'Lamar', 'Squizz'], ['سكويز'])).toEqual([
            'Almarai', 'Lamar', 'Squizz',
        ]);
    });
});

describe('matchTypedBrand — canonicalizing what a respondent typed', () => {
    it('matches a typed name to its brand regardless of case', () => {
        expect(matchTypedBrand('almarai', ['Almarai', 'Lamar'])).toBe('Almarai');
    });

    it('matches a typed Arabic name to its English brand', () => {
        expect(matchTypedBrand('سكويز', ['Squizz', 'KIKS'])).toBe('Squizz');
    });

    it('returns nothing when the typed name fits two brands', () => {
        // Guessing here would file the answer under the wrong brand.
        expect(matchTypedBrand('Lamarr', ['Almarai', 'Lamar'])).toBeUndefined();
    });
});
