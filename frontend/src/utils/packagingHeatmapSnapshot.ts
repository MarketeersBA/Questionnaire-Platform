import type { ProductTestConfig, PackagingImageAsset } from '../types/productTest';
import type {
    ProductTestBrandContext,
    ProductTestRespondentQuestion,
    ProductTestRespondentSection,
    ProductTestTimingPhase,
} from '../types/productTestRespondent';
import type { QuestionMeta } from '../types/tasteTest';
import { buildBrandScopedQuestionId, resolveBrandDisplayName } from './productTestPlaceholderEngine';

export const PACKAGING_HEATMAP_MAX_REGIONS = 30;
export const PACKAGING_HEATMAP_INTENTS = ['attraction', 'dislikes', 'improve'] as const;
export type PackagingHeatmapIntent = typeof PACKAGING_HEATMAP_INTENTS[number];

const INTENT_PROMPTS: Record<PackagingHeatmapIntent, Record<'front' | 'back', { en: string; ar: string }>> = {
    attraction: {
        front: {
            en: 'On the front of the packaging, tap the areas that attract you or make you like the product.',
            ar: 'على الوجه الأمامي للتغليف، اضغط على المناطق التي تجذبك أو تجعلك تحب المنتج.',
        },
        back: {
            en: 'On the back of the packaging, tap the areas that attract you or make you like the product.',
            ar: 'على الوجه الخلفي للتغليف، اضغط على المناطق التي تجذبك أو تجعلك تحب المنتج.',
        },
    },
    dislikes: {
        front: {
            en: 'On the front of the packaging, tap the areas you dislike.',
            ar: 'على الوجه الأمامي للتغليف، اضغط على المناطق التي لا تعجبك.',
        },
        back: {
            en: 'On the back of the packaging, tap the areas you dislike.',
            ar: 'على الوجه الخلفي للتغليف، اضغط على المناطق التي لا تعجبك.',
        },
    },
    improve: {
        front: {
            en: 'On the front of the packaging, tap the areas you would improve for a better experience.',
            ar: 'على الوجه الأمامي للتغليف، اضغط على المناطق التي تقترح تحسينها لتجربة أفضل.',
        },
        back: {
            en: 'On the back of the packaging, tap the areas you would improve for a better experience.',
            ar: 'على الوجه الخلفي للتغليف، اضغط على المناطق التي تقترح تحسينها لتجربة أفضل.',
        },
    },
};

export function heatmapCanonicalQuestionId(side: 'front' | 'back', intent: PackagingHeatmapIntent): string {
    return `pkg_hm_${side}_${intent}`;
}

function slugifyBrand(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64) || 'brand';
}

function configuredImageSides(config: ProductTestConfig): Array<'front' | 'back'> {
    const images = config.packaging_heatmap_images || {};
    const sides: Array<'front' | 'back'> = [];
    if (images.front?.asset_id) sides.push('front');
    if (images.back?.asset_id) sides.push('back');
    return sides;
}

export interface PackagingHeatmapSnapshotMeta {
    enabled: boolean;
    images: Partial<Record<'front' | 'back', Pick<PackagingImageAsset, 'asset_id' | 'width' | 'height' | 'mime' | 'side'>>>;
    max_clicks: number;
    intents: PackagingHeatmapIntent[];
    configured_sides: Array<'front' | 'back'>;
}

export function buildPackagingHeatmapSnapshotMeta(
    config: ProductTestConfig,
): PackagingHeatmapSnapshotMeta | null {
    if (!config.packaging_heatmap_enabled) return null;

    const configured = configuredImageSides(config);
    if (!configured.length) return null;

    const images = config.packaging_heatmap_images || {};
    const payloadImages: PackagingHeatmapSnapshotMeta['images'] = {};

    (['front', 'back'] as const).forEach((side) => {
        const asset = images[side];
        if (!asset?.asset_id) return;
        payloadImages[side] = {
            asset_id: asset.asset_id,
            side,
            width: asset.width,
            height: asset.height,
            mime: asset.mime,
        };
    });

    return {
        enabled: true,
        images: payloadImages,
        max_clicks: PACKAGING_HEATMAP_MAX_REGIONS,
        intents: [...PACKAGING_HEATMAP_INTENTS],
        configured_sides: configured,
    };
}

export function buildPackagingHeatmapQuestion(
    ownBrand: string,
    side: 'front' | 'back',
    intent: PackagingHeatmapIntent,
    language: 'en' | 'ar',
    imageAsset: PackagingImageAsset,
    brandContext: ProductTestBrandContext | null,
): ProductTestRespondentQuestion {
    const canonicalId = heatmapCanonicalQuestionId(side, intent);
    const isArabic = language === 'ar';
    const text = INTENT_PROMPTS[intent][side][isArabic ? 'ar' : 'en'];
    const displayBrand = brandContext
        ? resolveBrandDisplayName(ownBrand, brandContext)
        : ownBrand;

    const questionMeta: QuestionMeta & {
        imageSide: 'front' | 'back';
        heatmapIntent: PackagingHeatmapIntent;
        maxClicks: number;
        imageAssetId: string;
        imageWidth: number;
        imageHeight: number;
    } = {
        nature: 'fixed',
        inputType: 'packaging-heatmap',
        canonicalQuestionId: canonicalId,
        imageSide: side,
        heatmapIntent: intent,
        maxClicks: PACKAGING_HEATMAP_MAX_REGIONS,
        imageAssetId: imageAsset.asset_id,
        imageWidth: imageAsset.width,
        imageHeight: imageAsset.height,
    };

    return {
        id: buildBrandScopedQuestionId(ownBrand, canonicalId),
        text,
        type: 'packaging-heatmap',
        options: [],
        required: true,
        timing: 'packaging',
        diagnostic_tag: null,
        brand: ownBrand,
        displayBrand,
        canonicalQuestionId: canonicalId,
        questionMeta,
    };
}

export function buildPackagingHeatmapSection(
    config: ProductTestConfig,
    brandContext: ProductTestBrandContext | null,
    language: 'en' | 'ar',
): ProductTestRespondentSection | null {
    if (!config.packaging_heatmap_enabled) return null;

    const ownBrand = brandContext?.own_brand?.trim() || '';
    if (!ownBrand) return null;

    const images = config.packaging_heatmap_images || {};
    const sides = configuredImageSides(config);
    if (!sides.includes('front')) return null;

    const questions: ProductTestRespondentQuestion[] = [];
    sides.forEach((side) => {
        const asset = images[side];
        if (!asset) return;
        PACKAGING_HEATMAP_INTENTS.forEach((intent) => {
            questions.push(
                buildPackagingHeatmapQuestion(ownBrand, side, intent, language, asset, brandContext),
            );
        });
    });

    if (!questions.length) return null;

    const isArabic = language === 'ar';
    const displayBrand = brandContext
        ? resolveBrandDisplayName(ownBrand, brandContext)
        : ownBrand;

    return {
        id: `packaging_heatmap_${slugifyBrand(ownBrand)}`,
        title: isArabic ? 'خريطة حرارية للتغليف (العلامة المستهدفة)' : 'Packaging Heatmap (Target Brand)',
        module: 'packaging_heatmap',
        timing: 'packaging',
        brand: ownBrand,
        displayBrand,
        questions,
    };
}

export function enrichSnapshotWithPackagingHeatmapMeta<T extends { meta?: Record<string, unknown> }>(
    snapshot: T,
    config: ProductTestConfig,
): T {
    const hmMeta = buildPackagingHeatmapSnapshotMeta(config);
    if (!hmMeta) return snapshot;
    return {
        ...snapshot,
        meta: {
            ...(snapshot.meta || {}),
            packaging_heatmap: hmMeta,
        },
    };
}

export function composePackagingPhase(
    config: ProductTestConfig,
    packagePhase: { timing: ProductTestTimingPhase; label: string; sections: ProductTestRespondentSection[] } | null,
    brandContext: ProductTestBrandContext | null,
    language: 'en' | 'ar',
): { timing: ProductTestTimingPhase; label: string; sections: ProductTestRespondentSection[] } | null {
    const sections: ProductTestRespondentSection[] = [
        ...(packagePhase?.sections || []),
    ];

    const heatmapSection = buildPackagingHeatmapSection(config, brandContext, language);
    if (heatmapSection) sections.push(heatmapSection);

    if (!sections.length) return null;

    return {
        timing: 'packaging',
        label: packagePhase?.label || (language === 'ar' ? 'التعبئة والتغليف' : 'Packaging & Presentation'),
        sections,
    };
}
