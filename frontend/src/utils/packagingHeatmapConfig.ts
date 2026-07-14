import type { ProductTestConfig, PackagingImageAsset } from '../types/productTest';
import type { BlueprintPreflightResult } from './blueprintGenerationGuards';
import { packagingHeatmap } from '../services/api';

export const PACKAGING_HEATMAP_SCROLL_TARGET_ID = 'packaging-heatmap-config-panel';

export const ALLOWED_PACKAGING_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;

export const MAX_PACKAGING_IMAGE_MB = 5;

export interface PackagingHeatmapPendingFiles {
    front?: File | null;
    back?: File | null;
}

export interface PackagingHeatmapLocalPreview {
    url: string;
    width: number;
    height: number;
    sizeBytes: number;
    filename: string;
}

export function formatPackagingFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function countPackagingHeatmapQuestions(
    config: ProductTestConfig | null | undefined,
    pending?: PackagingHeatmapPendingFiles,
): number {
    if (!config?.packaging_heatmap_enabled) return 0;
    const images = countConfiguredPackagingImages(config, pending);
    return images * 3;
}

export function countConfiguredPackagingImages(
    config: ProductTestConfig | null | undefined,
    pending?: PackagingHeatmapPendingFiles,
): number {
    let count = 0;
    if (hasPackagingImageForSide(config, pending, 'front')) count += 1;
    if (hasPackagingImageForSide(config, pending, 'back')) count += 1;
    return count;
}

export function hasPackagingImageForSide(
    config: ProductTestConfig | null | undefined,
    pending: PackagingHeatmapPendingFiles | undefined,
    side: 'front' | 'back',
): boolean {
    const asset = config?.packaging_heatmap_images?.[side];
    if (asset?.asset_id) return true;
    return Boolean(pending?.[side]);
}

export function hasPackagingFrontImage(
    config: ProductTestConfig | null | undefined,
    pending?: PackagingHeatmapPendingFiles,
): boolean {
    return hasPackagingImageForSide(config, pending, 'front');
}

export function packagingHeatmapQuestionSummary(
    config: ProductTestConfig | null | undefined,
    pending?: PackagingHeatmapPendingFiles,
): string {
    const imageCount = countConfiguredPackagingImages(config, pending);
    if (imageCount === 0) return 'Upload at least a front image to generate heatmap questions';
    if (imageCount === 1) return '3 questions × 1 image';
    return '3 questions × 2 images = 6 heatmap questions';
}

export function validatePackagingHeatmapPreflight(
    config: ProductTestConfig | null | undefined,
    ownBrand: string | undefined,
    pending?: PackagingHeatmapPendingFiles,
): BlueprintPreflightResult {
    if (!config?.packaging_heatmap_enabled) {
        return { ok: true };
    }

    if (!ownBrand?.trim()) {
        return {
            ok: false,
            message: 'Packaging heatmap requires a target brand. Click the sparkle icon on a brand chip.',
            scrollTargetId: 'brand-architecture-section',
        };
    }

    if (!hasPackagingFrontImage(config, pending)) {
        return {
            ok: false,
            message: 'Packaging heatmap is enabled but no front image is uploaded.',
            scrollTargetId: PACKAGING_HEATMAP_SCROLL_TARGET_ID,
        };
    }

    return { ok: true };
}

export function validatePackagingImageFile(file: File): string | null {
    if (!ALLOWED_PACKAGING_IMAGE_TYPES.includes(file.type as typeof ALLOWED_PACKAGING_IMAGE_TYPES[number])) {
        return 'Allowed formats: JPEG, PNG, WebP.';
    }
    if (file.size > MAX_PACKAGING_IMAGE_MB * 1024 * 1024) {
        return `File too large. Max ${MAX_PACKAGING_IMAGE_MB}MB allowed.`;
    }
    return null;
}

export function readImageFileMeta(file: File): Promise<PackagingHeatmapLocalPreview> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            resolve({
                url,
                width: img.naturalWidth,
                height: img.naturalHeight,
                sizeBytes: file.size,
                filename: file.name,
            });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read image file.'));
        };
        img.src = url;
    });
}

export function revokePackagingPreviewUrl(url?: string | null) {
    if (url?.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

/**
 * Upload any staged files after survey creation, merging assets into product_test_config.
 */
export async function flushPendingPackagingHeatmapUploads(
    surveyId: string,
    config: ProductTestConfig | null | undefined,
    pending?: PackagingHeatmapPendingFiles,
): Promise<{ updatedConfig: ProductTestConfig | null; uploadedSides: Array<'front' | 'back'> }> {
    if (!config || !pending) {
        return { updatedConfig: config ?? null, uploadedSides: [] };
    }

    let nextConfig: ProductTestConfig = {
        ...config,
        packaging_heatmap_images: {
            front: config.packaging_heatmap_images?.front ?? null,
            back: config.packaging_heatmap_images?.back ?? null,
        },
    };
    const uploadedSides: Array<'front' | 'back'> = [];

    for (const side of ['front', 'back'] as const) {
        const file = pending[side];
        if (!file) continue;
        if (nextConfig.packaging_heatmap_images?.[side]?.asset_id) continue;

        const asset = await packagingHeatmap.uploadImage(surveyId, side, file) as PackagingImageAsset;
        nextConfig = {
            ...nextConfig,
            packaging_heatmap_images: {
                ...nextConfig.packaging_heatmap_images,
                [side]: asset,
            },
        };
        uploadedSides.push(side);
    }

    return { updatedConfig: nextConfig, uploadedSides };
}
