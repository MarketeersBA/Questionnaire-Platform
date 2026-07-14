import type { ProductTestConfig } from '../types/productTest';
import { normalizeTrialMediaCapture } from './trialMediaCaptureConfig';
import { productTestConfigs } from '../services/api';

/** API record shape returned from product-test-configs endpoints. */
export interface ProductTestConfigRecord extends ProductTestConfig {
    _id?: string;
    created_by?: string;
    created_at?: string;
}

export type ProductTestConfigApiPayload = Pick<
    ProductTestConfig,
    | 'language'
    | 'selected_attributes'
    | 'fixed_questions'
    | 'optional_questions'
    | 'package_test_enabled'
    | 'package_test_attributes'
>;

/**
 * Strip client-only / server-assigned fields for POST /product-test-configs/.
 */
export function toApiCreatePayload(config: ProductTestConfig): ProductTestConfigApiPayload {
    return {
        language: config.language,
        selected_attributes: config.selected_attributes || [],
        fixed_questions: config.fixed_questions || [],
        optional_questions: config.optional_questions || [],
        package_test_enabled: Boolean(config.package_test_enabled),
        package_test_attributes: config.package_test_attributes || [],
    };
}

/**
 * Map Mongo/API document to in-form ProductTestConfig.
 */
export function fromApiRecord(record: ProductTestConfigRecord): ProductTestConfig {
    return {
        config_id: record.config_id,
        family_id: record.family_id,
        version: record.version ?? 1,
        language: (record.language as ProductTestConfig['language']) || 'en',
        selected_attributes: record.selected_attributes || [],
        fixed_questions: record.fixed_questions || [],
        optional_questions: record.optional_questions || [],
        package_test_enabled: Boolean(record.package_test_enabled),
        package_test_attributes: record.package_test_attributes || [],
        packaging_heatmap_enabled: Boolean(record.packaging_heatmap_enabled),
        packaging_heatmap_images: record.packaging_heatmap_images || { front: null, back: null },
        trial_media_capture: normalizeTrialMediaCapture(record.trial_media_capture),
        status: record.status || 'draft',
    };
}

/** Human-readable label for saved-config picker rows. */
export function formatSavedConfigLabel(record: ProductTestConfigRecord): string {
    const attrCount = record.selected_attributes?.length ?? 0;
    const pkg = record.package_test_enabled ? ' · Package' : '';
    const lang = (record.language || 'en').toUpperCase();
    const preview = record.selected_attributes?.slice(0, 2).join(', ') || 'Fixed only';
    const suffix = attrCount > 2 ? ` +${attrCount - 2}` : '';
    return `${preview}${suffix} · ${lang}${pkg} · v${record.version ?? 1}`;
}

export async function listSavedProductTestConfigs(): Promise<ProductTestConfigRecord[]> {
    return productTestConfigs.list();
}

export async function saveProductTestConfigTemplate(
    config: ProductTestConfig,
): Promise<ProductTestConfigRecord> {
    if (config.config_id) {
        return productTestConfigs.update(config.config_id, toApiCreatePayload(config));
    }
    return productTestConfigs.create(toApiCreatePayload(config));
}

export async function deleteSavedProductTestConfigFamily(familyId: string): Promise<void> {
    await productTestConfigs.deleteFamily(familyId);
}
