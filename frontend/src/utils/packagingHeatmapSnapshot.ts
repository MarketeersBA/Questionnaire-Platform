import type { ProductTestConfig, PackagingImageAsset } from '../types/productTest';
import type {
    ProductTestBrandContext,
    ProductTestRespondentPhase,
    ProductTestRespondentQuestion,
    ProductTestRespondentSection,
    ProductTestSnapshot,
    ProductTestSnapshotMeta,
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

// Constrained to the real meta type rather than `Record<string, unknown>`:
// `ProductTestSnapshotMeta` has declared fields and no index signature, so a
// real snapshot never satisfied the looser constraint and every call site
// using one failed to type-check.
export function enrichSnapshotWithPackagingHeatmapMeta<T extends { meta?: ProductTestSnapshotMeta }>(
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

/**
 * Re-attach the heatmap section to a snapshot that was composed before its
 * images existed.
 *
 * A packaging image cannot be uploaded until the survey has an id, so on a
 * newly created survey the blueprint is necessarily composed while
 * `packaging_heatmap_images` is still empty — and a section with no image is
 * dropped entirely by `buildPackagingHeatmapSection`. The creator uploaded a
 * pack shot, deployed, and the heatmap questions were simply absent from the
 * survey, with nothing on screen to say why. Calling this once the upload has
 * returned its `asset_id` repairs the snapshot in place.
 *
 * Only the heatmap section is touched: every other phase, section and question
 * (and therefore every question id answers are keyed by) is left exactly as
 * composed. Re-running it is safe — the existing heatmap section is replaced,
 * not appended to — so it can also be used to pick up a swapped image.
 */
export function refreshPackagingHeatmapInSnapshot(
    snapshot: ProductTestSnapshot,
    config: ProductTestConfig,
): ProductTestSnapshot {
    const language = snapshot.language === 'ar' ? 'ar' : 'en';
    const section = buildPackagingHeatmapSection(config, snapshot.brand_context || null, language);

    const withoutHeatmap: ProductTestRespondentPhase[] = snapshot.phases
        .map((phase) => (
            phase.timing === 'packaging'
                ? { ...phase, sections: phase.sections.filter((s) => s.module !== 'packaging_heatmap') }
                : phase
        ))
        // A packaging phase that held nothing but the heatmap section would
        // otherwise survive as an empty, unskippable screen.
        .filter((phase) => phase.timing !== 'packaging' || phase.sections.length > 0);

    let phases = withoutHeatmap;
    if (section) {
        const existing = withoutHeatmap.find((phase) => phase.timing === 'packaging');
        if (existing) {
            phases = withoutHeatmap.map((phase) => (
                phase === existing
                    ? { ...phase, sections: [...phase.sections, section] }
                    : phase
            ));
        } else {
            phases = [...withoutHeatmap, {
                timing: 'packaging' as ProductTestTimingPhase,
                label: language === 'ar' ? 'التعبئة والتغليف' : 'Packaging & Presentation',
                sections: [section],
            }];
        }
    }

    return enrichSnapshotWithPackagingHeatmapMeta({ ...snapshot, phases }, config);
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
