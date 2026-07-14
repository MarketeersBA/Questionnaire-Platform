import { describe, expect, it } from 'vitest';
import {
    applyPlaceholdersWithBrandContext,
    applyProductTestPlaceholders,
    buildBrandScopedQuestionId,
    buildProductTestBrandContext,
    parseBrandScopedQuestionId,
    resolveBrandDisplayName,
    resolveProductTestDisplayText,
} from './productTestPlaceholderEngine';

const BRAND_CONTEXT = buildProductTestBrandContext({
    brands: ['Own Brand', 'Competitor X'],
    own_brand: 'Own Brand',
    category: 'Foam',
    testing_protocol: 'blind',
    blind_codes: {
        'Own Brand': 'SAMPLE-A',
        'Competitor X': 'SAMPLE-B',
    },
});

describe('productTestPlaceholderEngine', () => {
    describe('resolveBrandDisplayName', () => {
        it('returns canonical name in branded protocol', () => {
            expect(
                resolveBrandDisplayName('Own Brand', { testing_protocol: 'branded', blind_codes: {} }),
            ).toBe('Own Brand');
        });

        it('returns blind sample code when configured', () => {
            expect(
                resolveBrandDisplayName('Own Brand', {
                    testing_protocol: 'blind',
                    blind_codes: { 'Own Brand': 'SAMPLE-A' },
                }),
            ).toBe('SAMPLE-A');
        });

        it('does not expose brand key when blind code is missing', () => {
            expect(
                resolveBrandDisplayName('Unknown', {
                    testing_protocol: 'blind',
                    blind_codes: {},
                }),
            ).toMatch(/^Sample [A-Z]+$/);
        });

        it('generates ordered anonymous labels when blind code is missing', () => {
            expect(
                resolveBrandDisplayName('Competitor X', {
                    testing_protocol: 'blind',
                    blind_codes: {},
                    brands: ['Own Brand', 'Competitor X'],
                }),
            ).toBe('Sample B');
        });

        it('generates Arabic anonymous labels when blind code is missing', () => {
            expect(
                resolveBrandDisplayName('Brand B', {
                    testing_protocol: 'blind',
                    blind_codes: {},
                    brands: ['Brand A', 'Brand B'],
                    language: 'ar',
                }),
            ).toBe('العينة ب');
        });
    });

    describe('buildProductTestBrandContext', () => {
        it('dedupes and normalizes brand list', () => {
            const ctx = buildProductTestBrandContext({
                brands: ['A', 'A', ' B ', ''],
                category: '  Shampoo ',
                testing_protocol: 'branded',
            });
            expect(ctx.brands).toEqual(['A', 'B']);
            expect(ctx.category).toBe('Shampoo');
            expect(ctx.testing_protocol).toBe('branded');
        });
    });

    describe('applyProductTestPlaceholders', () => {
        it('replaces generic Product word with brand display name', () => {
            const text = applyProductTestPlaceholders('Product Look', {
                brand: 'Own Brand',
                category: 'Foam',
                testing_protocol: 'branded',
            });
            expect(text).toBe('Own Brand Look');
        });

        it('uses blind code for product word substitution', () => {
            const text = applyProductTestPlaceholders('Overall Product Evaluation', {
                brand: 'Own Brand',
                testing_protocol: 'blind',
                blind_codes: { 'Own Brand': 'SAMPLE-A' },
            });
            expect(text).toBe('Overall SAMPLE-A Evaluation');
        });

        it('replaces bracket and brace tokens', () => {
            const text = applyProductTestPlaceholders(
                '[Brand] in [Category] — [Attribute]',
                {
                    brand: 'Own Brand',
                    category: 'Foam',
                    attribute: 'Appearance',
                    testing_protocol: 'branded',
                },
            );
            expect(text).toBe('Own Brand in Foam — Appearance');
        });

        it('replaces Arabic product tokens', () => {
            const text = applyProductTestPlaceholders('مظهر المنتج', {
                brand: 'Own Brand',
                language: 'ar',
                testing_protocol: 'branded',
            });
            expect(text).toContain('Own Brand');
        });

        it('applyPlaceholdersWithBrandContext uses snapshot context', () => {
            const text = applyPlaceholdersWithBrandContext(
                'Product Color for [Category]',
                'Own Brand',
                BRAND_CONTEXT,
            );
            expect(text).toBe('SAMPLE-A Color for Foam');
        });
    });

    describe('buildBrandScopedQuestionId', () => {
        it('prefixes bank question id with brand', () => {
            expect(buildBrandScopedQuestionId('Own Brand', 'pt_q01')).toBe('Own Brand_pt_q01');
        });

        it('does not double-prefix', () => {
            expect(buildBrandScopedQuestionId('Own Brand', 'Own Brand_pt_q01')).toBe('Own Brand_pt_q01');
        });
    });

    describe('parseBrandScopedQuestionId', () => {
        it('extracts brand and canonical id from scoped key', () => {
            expect(
                parseBrandScopedQuestionId('Competitor X_pt_q08', ['Own Brand', 'Competitor X']),
            ).toEqual({ brand: 'Competitor X', canonicalQuestionId: 'pt_q08' });
        });
    });

    describe('resolveProductTestDisplayText', () => {
        it('swaps branded compose text for blind code at render time', () => {
            const text = resolveProductTestDisplayText('Own Brand Look', {
                brand: 'Own Brand',
                displayBrand: 'Own Brand',
                testing_protocol: 'blind',
                blind_codes: { 'Own Brand': 'SAMPLE-A' },
            });
            expect(text).toBe('SAMPLE-A Look');
        });

        it('applies legacy product word substitution when no brand on section', () => {
            const text = resolveProductTestDisplayText('Product Look', {
                brand: 'Own Brand',
                testing_protocol: 'branded',
            });
            expect(text).toBe('Own Brand Look');
        });
    });
});
