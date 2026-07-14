import { SurveyFormData } from '../pages/CreateSurvey/types';
import type { ProductTestConfig } from '../types/productTest';
import type { ProductTestSnapshot } from '../types/productTestRespondent';
import { snapshotHasBlueprintContent } from './productTestBlueprintUtils';
import {
    validatePackagingHeatmapPreflight,
    type PackagingHeatmapPendingFiles,
} from './packagingHeatmapConfig';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';

/** Canonical empty product test config — used when selecting Product Test survey type. */
export const DEFAULT_PRODUCT_TEST_CONFIG: ProductTestConfig = {
    version: 1,
    language: 'en',
    selected_attributes: [],
    fixed_questions: [],
    optional_questions: [],
    package_test_enabled: false,
    package_test_attributes: [],
    packaging_heatmap_enabled: false,
    packaging_heatmap_images: { front: null, back: null },
    trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
    status: 'draft',
};

export interface BrandArchitectureSnapshot {
    internalBrands: any[];
    competitiveBrands: any[];
    hasBrands: boolean;
}

export interface ProductTestBankStatusSnapshot {
    product_count: number;
    package_count: number;
    fixed_count: number;
    optional_count?: number;
    seeded: boolean;
    healthy?: boolean;
}

export type BlueprintPreflightResult =
    | { ok: true }
    | { ok: false; message: string; scrollTargetId?: string };

/**
 * Read brand lists from both formData top-level and nested config (defensive merge).
 */
export function resolveBrandArchitecture(formData: SurveyFormData): BrandArchitectureSnapshot {
    const configData = formData.config as Record<string, any> | null | undefined;
    const internalBrands =
        configData?.internal_brands_data
        || formData.internal_brands_data
        || [];
    const competitiveBrands =
        configData?.competitor_brands_data
        || formData.competitor_brands_data
        || [];
    return {
        internalBrands,
        competitiveBrands,
        hasBrands: internalBrands.length > 0 || competitiveBrands.length > 0,
    };
}

/**
 * Pre-compose checks for product test blueprint generation.
 */
export function validateProductTestPreflight(
    formData: SurveyFormData,
    bankStatus: ProductTestBankStatusSnapshot | null,
    options?: { packagingHeatmapPending?: PackagingHeatmapPendingFiles },
): BlueprintPreflightResult {
    const configData = formData.config as Record<string, any> | null | undefined;
    const { hasBrands } = resolveBrandArchitecture(formData);

    if (!configData?.category) {
        return {
            ok: false,
            message: 'Missing required field: Product Category',
            scrollTargetId: 'config-category-input',
        };
    }

    if (!hasBrands) {
        return {
            ok: false,
            message: 'Missing required field: Brands (Own or Competitive)',
            scrollTargetId: 'brand-architecture-section',
        };
    }

    if (!bankStatus) {
        return {
            ok: false,
            message: 'Could not verify product test question bank. Check your connection and try again.',
        };
    }

    if (bankStatus.product_count === 0 || !bankStatus.seeded) {
        return {
            ok: false,
            message: 'Product test question bank is empty. Run data seed or contact your administrator.',
        };
    }

    if (bankStatus.fixed_count === 0) {
        return {
            ok: false,
            message: 'Product test bank has no fixed questions. Re-seed the bank or contact your administrator.',
        };
    }

    const heatmapCheck = validatePackagingHeatmapPreflight(
        formData.product_test_config,
        (formData.config as Record<string, any> | null | undefined)?.own_brand,
        options?.packagingHeatmapPending,
    );
    if (!heatmapCheck.ok) {
        return heatmapCheck;
    }

    return { ok: true };
}

/**
 * Post-compose check — product_test_snapshot must have questions for product test surveys.
 */
export function validateProductTestPostGeneration(
    mergedSchema: SurveyFormData['schema'],
    bankStatus: ProductTestBankStatusSnapshot | null,
): BlueprintPreflightResult {
    const snapshot = mergedSchema?.product_test_snapshot as ProductTestSnapshot | null | undefined;
    if (snapshotHasBlueprintContent(snapshot)) {
        return { ok: true };
    }

    // Rollout fallback: accept legacy L2 sections during migration window
    const l2Sections = mergedSchema?.layer2_structure?.sections || [];
    if (l2Sections.length > 0) {
        return { ok: true };
    }

    const hasFixedInBank = (bankStatus?.fixed_count ?? 0) > 0;
    if (hasFixedInBank) {
        return {
            ok: false,
            message: 'No questions matched your configuration. Open Product Test Configuration and select attributes, or verify fixed questions exist in the bank.',
        };
    }

    return {
        ok: false,
        message: 'Blueprint generation produced no product test questions.',
    };
}

export function countLayerQuestions(schema: SurveyFormData['schema'], layer: 'layer1_structure' | 'layer2_structure'): number {
    return schema?.[layer]?.sections?.reduce(
        (acc: number, s: { questions?: unknown[] }) => acc + (s.questions?.length || 0),
        0,
    ) || 0;
}
