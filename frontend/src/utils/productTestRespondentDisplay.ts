import type { ProductTestBrandContext, ProductTestSnapshot, ProductTestTestingProtocol } from '../types/productTestRespondent';
import {
    applyRuntimeBrandFallbackToSnapshot,
} from './productTestSnapshotMigration';
import {
    resolveBrandContextFromFormConfig,
    resolveBrandDisplayName,
} from './productTestPlaceholderEngine';

/** Runtime display context passed through the product test respondent tree. */
export interface ProductTestRespondentDisplayContext {
    category: string;
    brands: string[];
    testing_protocol: ProductTestTestingProtocol;
    blind_codes: Record<string, string>;
    resolveBrandDisplay: (brandKey: string) => string;
}

/** Build respondent display context from public GET survey payload. */
export function buildProductTestRespondentDisplayContext(
    survey: {
        config?: {
            category?: string;
            testing_protocol?: ProductTestTestingProtocol;
            blind_codes?: Record<string, string>;
            own_brand?: string;
            internal_brands_data?: Array<{ name: string }>;
            competitor_brands_data?: Array<{ name: string }>;
            competitive_brands?: string[];
        };
        language?: 'en' | 'ar';
        customizations?: { category?: string };
        product_test_snapshot?: ProductTestSnapshot | { brand_context?: ProductTestBrandContext | null };
        taste_test_config?: {
            category?: string;
            testing_protocol?: ProductTestTestingProtocol;
            blind_codes?: Record<string, string>;
            own_brand?: string;
            internal_brands_data?: Array<{ name: string }>;
            competitor_brands_data?: Array<{ name: string }>;
            competitive_brands?: string[];
        };
    } | null | undefined,
): ProductTestRespondentDisplayContext {
    const snapshot = survey?.product_test_snapshot;
    const snapshotWithFallback = snapshot
        ? applyRuntimeBrandFallbackToSnapshot(
            snapshot as ProductTestSnapshot,
            survey?.taste_test_config || survey?.config,
        )
        : null;
    const snapshotCtx = snapshotWithFallback?.brand_context;
    const config = survey?.config;
    const ttConfig = survey?.taste_test_config;
    const configBrandInput = resolveBrandContextFromFormConfig(config);
    const tasteBrandInput = resolveBrandContextFromFormConfig(ttConfig);
    const language = survey?.language === 'ar' ? 'ar' : 'en';

    const testing_protocol =
        snapshotCtx?.testing_protocol
        || ttConfig?.testing_protocol
        || config?.testing_protocol
        || 'branded';

    const blind_codes = {
        ...(config?.blind_codes || {}),
        ...(ttConfig?.blind_codes || {}),
        ...(snapshotCtx?.blind_codes || {}),
    };

    const brands = snapshotCtx?.brands?.length
        ? snapshotCtx.brands
        : tasteBrandInput.brands?.length
            ? tasteBrandInput.brands
            : configBrandInput.brands || [];

    const category =
        snapshotCtx?.category
        || config?.category
        || ttConfig?.category
        || survey?.customizations?.category
        || '';

    const resolveBrandDisplay = (brandKey: string): string => {
        if (!brandKey?.trim()) return '';
        return resolveBrandDisplayName(brandKey, {
            testing_protocol,
            blind_codes,
            brands,
            language,
        });
    };

    return {
        category,
        brands,
        testing_protocol,
        blind_codes,
        resolveBrandDisplay,
    };
}

/** Voice metadata brand label — prefers effective brand over category. */
export function resolveProductTestVoiceBrandName(
    sectionBrand: string | undefined,
    display: ProductTestRespondentDisplayContext,
): string {
    if (sectionBrand?.trim()) {
        return display.resolveBrandDisplay(sectionBrand);
    }
    return display.category || 'Product';
}
