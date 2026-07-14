import { describe, expect, it } from 'vitest';
import {
    buildProductTestRespondentDisplayContext,
    resolveProductTestVoiceBrandName,
} from './productTestRespondentDisplay';

describe('productTestRespondentDisplay', () => {
    it('builds display context from snapshot brand_context with blind codes', () => {
        const ctx = buildProductTestRespondentDisplayContext({
            config: { testing_protocol: 'branded' },
            product_test_snapshot: {
                brand_context: {
                    brands: ['Own Brand'],
                    category: 'Foam',
                    testing_protocol: 'blind',
                    blind_codes: { 'Own Brand': 'SAMPLE-A' },
                },
            },
        });

        expect(ctx.category).toBe('Foam');
        expect(ctx.testing_protocol).toBe('blind');
        expect(ctx.resolveBrandDisplay('Own Brand')).toBe('SAMPLE-A');
    });

    it('falls back to survey config when snapshot context missing', () => {
        const ctx = buildProductTestRespondentDisplayContext({
            config: {
                category: 'Shampoo',
                testing_protocol: 'branded',
            },
            customizations: { category: 'Ignored' },
        });

        expect(ctx.category).toBe('Shampoo');
        expect(ctx.resolveBrandDisplay('Brand X')).toBe('Brand X');
    });

    it('generates sample labels for blind surveys without configured codes', () => {
        const ctx = buildProductTestRespondentDisplayContext({
            language: 'en',
            taste_test_config: {
                testing_protocol: 'blind',
                internal_brands_data: [{ name: 'Dina Farms' }],
                competitor_brands_data: [{ name: 'Brand B' }],
                blind_codes: {},
            },
        });

        expect(ctx.resolveBrandDisplay('Dina Farms')).toBe('Sample A');
        expect(ctx.resolveBrandDisplay('Brand B')).toBe('Sample B');
    });

    it('merges blind codes from config when snapshot codes are empty', () => {
        const ctx = buildProductTestRespondentDisplayContext({
            taste_test_config: {
                testing_protocol: 'blind',
                internal_brands_data: [{ name: 'Dina Farms' }],
                blind_codes: { 'Dina Farms': 'مربع' },
            },
            product_test_snapshot: {
                brand_context: {
                    brands: ['Dina Farms'],
                    category: 'Milk',
                    testing_protocol: 'blind',
                    blind_codes: {},
                },
            },
        });

        expect(ctx.resolveBrandDisplay('Dina Farms')).toBe('مربع');
    });

    it('applies runtime fallback from taste_test_config on legacy snapshot', () => {
        const ctx = buildProductTestRespondentDisplayContext({
            taste_test_config: {
                own_brand: 'Own Brand',
                testing_protocol: 'blind',
                blind_codes: { 'Own Brand': 'SAMPLE-A' },
            },
            product_test_snapshot: {
                version: 1,
                language: 'en',
                phases: [],
                meta: {
                    totalQuestions: 0,
                    sectionCount: 0,
                    phaseCount: 0,
                    generatedAt: '',
                },
            },
        });
        expect(ctx.resolveBrandDisplay('Own Brand')).toBe('SAMPLE-A');
    });

    it('resolveProductTestVoiceBrandName prefers brand over category', () => {
        const ctx = buildProductTestRespondentDisplayContext({
            config: { category: 'Foam', testing_protocol: 'branded' },
        });
        expect(resolveProductTestVoiceBrandName('Own Brand', ctx)).toBe('Own Brand');
        expect(resolveProductTestVoiceBrandName(undefined, ctx)).toBe('Foam');
    });
});
