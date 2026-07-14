import type { ProductTestBrandContext, ProductTestSnapshot } from '../types/productTestRespondent';
import { buildProductTestBrandContext, resolveBrandContextFromFormConfig } from './productTestPlaceholderEngine';

export const RUNTIME_BRAND_FALLBACK_SOURCE = 'runtime_fallback' as const;

export function snapshotHasBrandContext(
    snapshot: ProductTestSnapshot | null | undefined,
): boolean {
    return Boolean(snapshot?.brand_context?.brands?.length);
}

export function surveyHasConfiguredBrands(
    config: Parameters<typeof resolveBrandContextFromFormConfig>[0],
): boolean {
    const input = resolveBrandContextFromFormConfig(config);
    return Boolean(input.brands?.length);
}

/** True when stored snapshot should be re-composed with brand loop (Architect refresh / save). */
export function snapshotNeedsBrandRecompose(
    snapshot: ProductTestSnapshot | null | undefined,
    config: Parameters<typeof resolveBrandContextFromFormConfig>[0],
): boolean {
    if (!snapshot?.phases?.length) return false;
    if (snapshotHasBrandContext(snapshot)) return false;
    return surveyHasConfiguredBrands(config);
}

/**
 * Display-only fallback when snapshot lacks brand_context.
 * own_brand → first configured brand → category.
 */
export function resolveRuntimeSingleBrandContext(
    config: Parameters<typeof resolveBrandContextFromFormConfig>[0],
): ProductTestBrandContext | null {
    const input = resolveBrandContextFromFormConfig(config);
    if (input.brands?.length) {
        return buildProductTestBrandContext(input);
    }

    if (input.own_brand?.trim()) {
        return buildProductTestBrandContext({
            ...input,
            brands: [input.own_brand.trim()],
        });
    }

    const explicitCategory = (input.category || '').trim();
    if (explicitCategory) {
        return buildProductTestBrandContext({
            ...input,
            brands: [explicitCategory],
            category: explicitCategory,
        });
    }

    return null;
}

/** Merge synthetic brand_context for respondent display on legacy snapshots. */
export function applyRuntimeBrandFallbackToSnapshot(
    snapshot: ProductTestSnapshot,
    config: Parameters<typeof resolveBrandContextFromFormConfig>[0],
): ProductTestSnapshot {
    if (snapshotHasBrandContext(snapshot)) return snapshot;

    const fallback = resolveRuntimeSingleBrandContext(config);
    if (!fallback) return snapshot;

    return {
        ...snapshot,
        brand_context: {
            ...fallback,
            _source: RUNTIME_BRAND_FALLBACK_SOURCE,
        },
    };
}
