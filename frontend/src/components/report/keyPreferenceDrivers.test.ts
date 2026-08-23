import { describe, it, expect } from 'vitest';
import {
    normKey,
    resolveMainKey,
    toImportance,
    buildGroups,
    countSubAttributes,
} from './keyPreferenceDriversLogic';

describe('normKey', () => {
    it('collapses case, spacing and punctuation to one canonical form', () => {
        expect(normKey('Eating  Experience')).toBe('eating experience');
        expect(normKey('eating_experience')).toBe('eating experience');
        expect(normKey('Eating-Experience')).toBe('eating experience');
        expect(normKey('Taste (Quality)!')).toBe('taste quality');
    });

    it('is stable for empty-ish input', () => {
        expect(normKey('')).toBe('');
        expect(normKey('   ')).toBe('');
    });
});

describe('toImportance', () => {
    it('always divides by 100, including the 0.01 sentinel that used to break', () => {
        // The old guard was `x > 1 ? x / 100 : x`, so a correlation of exactly
        // 0.01 arrived as 1.0 and was left unscaled — 100x off.
        expect(toImportance(1.0)).toBeCloseTo(0.01);
        expect(toImportance(48)).toBeCloseTo(0.48);
        expect(toImportance(0)).toBe(0);
    });
});

describe('resolveMainKey', () => {
    const available = new Set(['taste quality', 'outershape', 'freshness']);

    it('prefers an exact match', () => {
        expect(resolveMainKey('outershape', available)).toBe('outershape');
    });

    it('recovers legacy reports whose two panels used different vocabularies', () => {
        // main_scatter said "Taste", registry said "Taste Quality".
        expect(resolveMainKey('taste', available)).toBe('taste quality');
    });

    it('returns null when nothing plausibly matches', () => {
        expect(resolveMainKey('purchase intent', available)).toBeNull();
        expect(resolveMainKey('', available)).toBeNull();
    });

    it('picks the closest candidate by length when several contain the key', () => {
        const many = new Set(['taste', 'taste quality', 'taste quality overall']);
        expect(resolveMainKey('taste', many)).toBe('taste');
    });
});

describe('countSubAttributes', () => {
    it('uses the hierarchy when the backend supplies one', () => {
        const counts = countSubAttributes({
            attribute_hierarchy: [
                { main_key: 'taste', main_attribute: 'Taste', sub_attributes: ['Fresh Milk', 'Not Bitter'] },
                { main_key: 'outershape', main_attribute: 'Outershape', sub_attributes: [] },
            ],
        });
        expect(counts.get('taste')).toBe(2);
        expect(counts.get('outershape')).toBe(0);
    });

    it('rebuilds counts for legacy reports with no hierarchy, deduping across brands', () => {
        const counts = countSubAttributes({
            sub_scatter: {
                datasets: [
                    {
                        brand: 'Hero',
                        data: [
                            { main_attribute: 'Taste', sub_attribute: 'Fresh Milk' },
                            { main_attribute: 'Taste', sub_attribute: 'Not Bitter' },
                        ],
                    },
                    {
                        // Same two sub-attributes, second brand — must not double count.
                        brand: 'Abu Aouf',
                        data: [
                            { main_attribute: 'Taste', sub_attribute: 'Fresh Milk' },
                            { main_attribute: 'Taste', sub_attribute: 'Not Bitter' },
                        ],
                    },
                ],
            },
        });
        expect(counts.get('taste')).toBe(2);
    });

    it('does not count a flat attribute that echoes its own name', () => {
        const counts = countSubAttributes({
            sub_scatter: {
                datasets: [{
                    brand: 'Hero',
                    data: [{ main_attribute: 'Outershape', sub_attribute: 'Outershape' }],
                }],
            },
        });
        expect(counts.get('outershape') ?? 0).toBe(0);
    });
});

describe('buildGroups', () => {
    const datasets = [
        {
            brand: 'Hero',
            data: [
                { attribute: 'Freshness', x: 40, y: 62 },
                { attribute: 'Outershape', x: 30, y: 55 },
                { attribute: 'Overall Likeness', x: 90, y: 80 }, // dependent variable
            ],
        },
        {
            brand: 'Abu Aouf',
            data: [
                { attribute: 'Freshness', x: 40, y: 71 },
                { attribute: 'Outershape', x: 30, y: 44 },
            ],
        },
    ];

    const groups = buildGroups(datasets, ['Hero', 'Abu Aouf'], {
        labelOf: (pt: any) => pt.attribute,
        keyOf: (pt: any) => normKey(pt.attribute),
    });

    it('drops the dependent variable from the driver list', () => {
        expect(groups.map((g) => g.label)).not.toContain('Overall Likeness');
    });

    it('groups both brands into one box per attribute', () => {
        const freshness = groups.find((g) => g.key === 'freshness')!;
        expect(freshness.marks).toHaveLength(2);
        expect(freshness.minY).toBe(62);
        expect(freshness.maxY).toBe(71);
    });

    it('scales importance into the 0-1 range', () => {
        expect(groups.find((g) => g.key === 'freshness')!.x).toBeCloseTo(0.4);
    });

    it('sorts by importance, strongest driver first', () => {
        expect(groups.map((g) => g.key)).toEqual(['freshness', 'outershape']);
    });

    it('ignores points with non-numeric coordinates', () => {
        const dirty = buildGroups(
            [{ brand: 'Hero', data: [{ attribute: 'Broken', x: null, y: 'n/a' }] }],
            ['Hero'],
            { labelOf: (pt: any) => pt.attribute, keyOf: (pt: any) => normKey(pt.attribute) },
        );
        expect(dirty).toHaveLength(0);
    });
});
