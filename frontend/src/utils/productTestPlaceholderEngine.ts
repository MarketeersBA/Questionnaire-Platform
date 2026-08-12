import type {
    ProductTestBrandContext,
    ProductTestBrandContextInput,
    ProductTestTestingProtocol,
} from '../types/productTestRespondent';

export type { ProductTestBrandContext, ProductTestBrandContextInput, ProductTestTestingProtocol };

export interface ProductTestPlaceholderContext {
    /** Canonical brand key (internal or competitive name). */
    brand: string;
    /** Canonical brand order, used to generate anonymous fallback sample labels. */
    brands?: string[];
    category?: string;
    attribute?: string;
    language?: 'en' | 'ar';
    testing_protocol?: ProductTestTestingProtocol;
    blind_codes?: Record<string, string>;
}

const DEFAULT_CATEGORY_EN = 'Category';
const DEFAULT_CATEGORY_AR = 'الفئة';
const DEFAULT_BRAND_EN = 'product';
const DEFAULT_BRAND_AR = 'المنتج';
const ARABIC_SAMPLE_SUFFIXES = [
    'أ',
    'ب',
    'ج',
    'د',
    'هـ',
    'و',
    'ز',
    'ح',
    'ط',
    'ي',
    'ك',
    'ل',
    'م',
    'ن',
    'س',
    'ع',
    'ف',
    'ص',
    'ق',
    'ر',
    'ش',
    'ت',
    'ث',
    'خ',
    'ذ',
    'ض',
];

function sampleSuffixFromIndex(index: number, language: 'en' | 'ar' = 'en'): string {
    const safeIndex = Math.max(0, index);
    if (language === 'ar') {
        const base = ARABIC_SAMPLE_SUFFIXES[safeIndex % ARABIC_SAMPLE_SUFFIXES.length];
        const cycle = Math.floor(safeIndex / ARABIC_SAMPLE_SUFFIXES.length);
        return cycle > 0 ? `${base}${cycle + 1}` : base;
    }

    let n = safeIndex;
    let suffix = '';
    do {
        suffix = String.fromCharCode(65 + (n % 26)) + suffix;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return suffix;
}

function stableBrandIndex(brandKey: string): number {
    let hash = 0;
    for (let i = 0; i < brandKey.length; i += 1) {
        hash = (hash * 31 + brandKey.charCodeAt(i)) >>> 0;
    }
    return hash % 26;
}

export function formatBlindSampleLabel(
    index: number,
    language: 'en' | 'ar' = 'en',
): string {
    const suffix = sampleSuffixFromIndex(index, language);
    return language === 'ar' ? `العينة ${suffix}` : `Sample ${suffix}`;
}

export function resolveBlindSampleLabel(
    brandKey: string,
    context: Pick<ProductTestPlaceholderContext, 'blind_codes' | 'brands' | 'language'>,
): string {
    const trimmed = brandKey?.trim();
    const configuredCode = trimmed ? context.blind_codes?.[trimmed]?.trim() : '';
    if (configuredCode) return configuredCode;

    const brandIndex = trimmed && context.brands?.length
        ? context.brands.findIndex((brand) => brand.trim() === trimmed)
        : -1;
    const index = brandIndex >= 0 ? brandIndex : stableBrandIndex(trimmed || 'sample');
    return formatBlindSampleLabel(index, context.language);
}

/**
 * Resolve respondent-facing brand label.
 * Branded protocol → canonical brand name; blind → configured or generated sample label.
 */
export function resolveBrandDisplayName(
    brandKey: string,
    context: Pick<ProductTestPlaceholderContext, 'testing_protocol' | 'blind_codes' | 'brands' | 'language'>,
): string {
    const trimmed = brandKey?.trim();
    if (!trimmed) return '';

    if (context.testing_protocol === 'blind') {
        return resolveBlindSampleLabel(trimmed, context);
    }

    return trimmed;
}

/** Normalize Parameters-stage input into a snapshot-ready brand context. */
export function buildProductTestBrandContext(
    input: ProductTestBrandContextInput,
): ProductTestBrandContext {
    const brands = [...new Set((input.brands || []).map((b) => b.trim()).filter(Boolean))];
    return {
        brands,
        own_brand: input.own_brand?.trim() || undefined,
        category: input.category?.trim() || DEFAULT_CATEGORY_EN,
        testing_protocol: input.testing_protocol ?? 'branded',
        blind_codes: input.blind_codes ?? {},
    };
}

/**
 * Apply product-test placeholder substitution to question/section copy.
 * Single source of truth for FE compose and render paths.
 */
export function applyProductTestPlaceholders(
    text: string,
    ctx: ProductTestPlaceholderContext,
): string {
    if (!text) return '';

    const language = ctx.language ?? 'en';
    const category = ctx.category?.trim()
        || (language === 'ar' ? DEFAULT_CATEGORY_AR : DEFAULT_CATEGORY_EN);
    const attribute = ctx.attribute?.trim() ?? '';
    const brandDisplay = resolveBrandDisplayName(ctx.brand, ctx);
    const brandFallback = brandDisplay
        || (language === 'ar' ? DEFAULT_BRAND_AR : DEFAULT_BRAND_EN);

    let result = text;

    // Bracket / brace tokens (explicit)
    result = result.replace(/\[\s*Brand\s*\]/gi, brandDisplay);
    result = result.replace(/\{\s*brand\s*\}/gi, brandDisplay);
    result = result.replace(/\[\s*brand\s*\]/gi, brandDisplay);
    result = result.replace(/\[\s*Product\s*\]/gi, brandDisplay);
    result = result.replace(/\[\s*product\s*\]/gi, brandDisplay);
    result = result.replace(/\[\s*Category\s*\]/gi, category);
    result = result.replace(/\{\s*category\s*\}/gi, category);
    result = result.replace(/\[\s*category\s*\]/gi, category);
    result = result.replace(/\[\s*Attribute\s*\]/gi, attribute);

    // Arabic brand tokens
    result = result.replace(/\(البراند\)/g, brandDisplay);

    // Arabic product tokens (parenthesized first to avoid partial clobber)
    result = result.replace(/\(المنتج\)/g, brandDisplay);

    return result;
}

/**
 * Build stable scoped question id: `{brand}_{bankQuestionId}`.
 * Matches taste-test L2 answer key convention.
 */
export function buildBrandScopedQuestionId(brand: string, bankQuestionId: string): string {
    const brandPart = brand.trim();
    const questionPart = bankQuestionId.trim();
    if (!brandPart) return questionPart;
    if (!questionPart) return brandPart;
    if (questionPart.startsWith(`${brandPart}_`)) return questionPart;
    return `${brandPart}_${questionPart}`;
}

/** Parse brand + canonical id from a scoped question id. */
export function parseBrandScopedQuestionId(
    scopedId: string,
    knownBrands: string[],
): { brand: string; canonicalQuestionId: string } {
    const sorted = [...knownBrands].sort((a, b) => b.length - a.length);
    for (const brand of sorted) {
        const prefix = `${brand}_`;
        if (scopedId.startsWith(prefix)) {
            return { brand, canonicalQuestionId: scopedId.slice(prefix.length) };
        }
    }
    return { brand: '', canonicalQuestionId: scopedId };
}

/** Build brand context input from shared Parameters config (taste_test_config shell). */
export function resolveBrandContextFromFormConfig(
    config: {
        own_brand?: string;
        category?: string;
        testing_protocol?: ProductTestTestingProtocol;
        blind_codes?: Record<string, string>;
        internal_brands_data?: Array<{ name: string }>;
        competitor_brands_data?: Array<{ name: string }>;
        competitive_brands?: string[];
    } | null | undefined,
): ProductTestBrandContextInput {
    const internalNames =
        config?.internal_brands_data?.map((b) => b.name).filter(Boolean)
        || (config?.own_brand ? [config.own_brand] : []);
    const competitorNames =
        config?.competitor_brands_data?.map((b) => b.name).filter(Boolean)
        || config?.competitive_brands?.filter(Boolean)
        || [];

    return {
        brands: [...internalNames, ...competitorNames],
        own_brand: config?.own_brand,
        category: config?.category,
        testing_protocol: config?.testing_protocol,
        blind_codes: config?.blind_codes,
    };
}

/** Convenience: apply placeholders using full brand_context from snapshot. */
export function applyPlaceholdersWithBrandContext(
    text: string,
    brandKey: string,
    brandContext: ProductTestBrandContext,
    options: { attribute?: string; language?: 'en' | 'ar' } = {},
): string {
    return applyProductTestPlaceholders(text, {
        brand: brandKey,
        category: brandContext.category,
        attribute: options.attribute,
        language: options.language,
        testing_protocol: brandContext.testing_protocol,
        blind_codes: brandContext.blind_codes,
        brands: brandContext.brands,
    });
}

export interface ProductTestDisplayResolutionContext {
    brand?: string;
    displayBrand?: string;
    category?: string;
    attribute?: string;
    language?: 'en' | 'ar';
    testing_protocol?: ProductTestTestingProtocol;
    blind_codes?: Record<string, string>;
    brands?: string[];
}

/**
 * Resolve respondent-visible copy at render time.
 * Re-applies blind codes when compose-time displayBrand differs from current protocol.
 * Falls back to full placeholder pass for legacy uncomposed bank text.
 */
export function resolveProductTestDisplayText(
    text: string,
    ctx: ProductTestDisplayResolutionContext,
): string {
    if (!text) return '';

    const brandKey = ctx.brand?.trim();
    if (!brandKey) {
        return applyProductTestPlaceholders(text, {
            brand: '',
            category: ctx.category,
            attribute: ctx.attribute,
            language: ctx.language,
            testing_protocol: ctx.testing_protocol,
            blind_codes: ctx.blind_codes,
            brands: ctx.brands,
        });
    }

    const effectiveDisplay = resolveBrandDisplayName(brandKey, ctx);
    const cachedDisplay = ctx.displayBrand?.trim();

    let result = text;
    if (cachedDisplay && cachedDisplay !== effectiveDisplay) {
        result = result.split(cachedDisplay).join(effectiveDisplay);
    }
    if (brandKey !== effectiveDisplay && result.includes(brandKey)) {
        result = result.split(brandKey).join(effectiveDisplay);
    }

    if (/product|المنتج|منتج|\[Brand\]|\{brand\}/i.test(result)) {
        return applyProductTestPlaceholders(result, {
            brand: brandKey,
            category: ctx.category,
            attribute: ctx.attribute,
            language: ctx.language,
            testing_protocol: ctx.testing_protocol,
            blind_codes: ctx.blind_codes,
            brands: ctx.brands,
        });
    }

    return result;
}
