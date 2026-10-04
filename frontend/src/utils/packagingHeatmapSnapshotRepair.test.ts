import { describe, it, expect } from 'vitest';
import { refreshPackagingHeatmapInSnapshot } from './packagingHeatmapSnapshot';
import type { ProductTestSnapshot } from '../types/productTestRespondent';

/**
 * A packaging image can only be uploaded against a survey that already exists,
 * so on a newly created survey the blueprint is necessarily composed while the
 * image set is still empty — and a heatmap section with no image is dropped
 * entirely. The creator uploaded a pack shot, deployed, and the heatmap
 * questions were simply absent, with nothing on screen to say why; the only
 * workaround was to save a draft, re-open it, and regenerate by hand.
 */
const ASSET = {
    asset_id: 'a1b2c3',
    side: 'front' as const,
    survey_id: 's1',
    width: 1200,
    height: 1600,
    mime: 'image/png',
    filename: 'front.png',
    uploaded_at: '2026-10-01T00:00:00Z',
};

function baseSnapshot(): ProductTestSnapshot {
    return {
        version: 1,
        language: 'en',
        brand_context: {
            brands: ['KIKS'],
            own_brand: 'KIKS',
            category: 'Ice Cream',
            testing_protocol: 'branded',
            blind_codes: {},
        },
        phases: [
            {
                timing: 'after_use',
                label: 'After Use',
                sections: [
                    { id: 'sec_after', title: 'KIKS: After Use', module: 'product_test', questions: [{ id: 'q1' }] },
                ],
            },
        ],
        meta: { totalQuestions: 1, sectionCount: 1, phaseCount: 1, generatedAt: '2026-10-01T00:00:00Z' },
    } as unknown as ProductTestSnapshot;
}

const enabledConfig: any = {
    packaging_heatmap_enabled: true,
    packaging_heatmap_images: { front: ASSET, back: null },
};

function heatmapSections(snapshot: ProductTestSnapshot) {
    return snapshot.phases
        .flatMap((p) => p.sections)
        .filter((s: any) => s.module === 'packaging_heatmap');
}

describe('refreshPackagingHeatmapInSnapshot', () => {
    it('adds the heatmap questions a pre-upload blueprint could not include', () => {
        const before = baseSnapshot();
        expect(heatmapSections(before)).toHaveLength(0);

        const after = refreshPackagingHeatmapInSnapshot(before, enabledConfig);

        const sections = heatmapSections(after);
        expect(sections).toHaveLength(1);
        // Front image only -> one question per intent.
        expect(sections[0].questions).toHaveLength(3);
        expect(sections[0].questions.map((q: any) => q.id)).toEqual([
            'KIKS_pkg_hm_front_attraction',
            'KIKS_pkg_hm_front_dislikes',
            'KIKS_pkg_hm_front_improve',
        ]);
    });

    it('creates the packaging phase when the blueprint had none at all', () => {
        const after = refreshPackagingHeatmapInSnapshot(baseSnapshot(), enabledConfig);
        const packaging = after.phases.find((p) => p.timing === 'packaging');
        expect(packaging).toBeDefined();
        expect(packaging!.sections).toHaveLength(1);
    });

    it('leaves every other phase, section and question untouched', () => {
        const before = baseSnapshot();
        const after = refreshPackagingHeatmapInSnapshot(before, enabledConfig);

        const afterUse = after.phases.find((p) => p.timing === 'after_use');
        expect(afterUse).toEqual(before.phases[0]);
    });

    it('is safe to run twice — it replaces the section rather than stacking copies', () => {
        const once = refreshPackagingHeatmapInSnapshot(baseSnapshot(), enabledConfig);
        const twice = refreshPackagingHeatmapInSnapshot(once, enabledConfig);

        expect(heatmapSections(twice)).toHaveLength(1);
        expect(twice.phases.filter((p) => p.timing === 'packaging')).toHaveLength(1);
    });

    it('picks up a back image added later, giving six questions', () => {
        const after = refreshPackagingHeatmapInSnapshot(baseSnapshot(), {
            ...enabledConfig,
            packaging_heatmap_images: { front: ASSET, back: { ...ASSET, side: 'back', asset_id: 'd4e5f6' } },
        });
        expect(heatmapSections(after)[0].questions).toHaveLength(6);
    });

    it('publishes the image metadata respondent clients need', () => {
        const after = refreshPackagingHeatmapInSnapshot(baseSnapshot(), enabledConfig);
        expect((after.meta as any).packaging_heatmap).toBeTruthy();
    });

    it('removes the section again if the heatmap is switched off', () => {
        const withHeatmap = refreshPackagingHeatmapInSnapshot(baseSnapshot(), enabledConfig);
        const off = refreshPackagingHeatmapInSnapshot(withHeatmap, {
            ...enabledConfig,
            packaging_heatmap_enabled: false,
        });

        expect(heatmapSections(off)).toHaveLength(0);
        // The phase existed only to carry the heatmap, so it should not linger
        // as an empty screen the respondent still has to page through.
        expect(off.phases.find((p) => p.timing === 'packaging')).toBeUndefined();
    });

    it('does nothing when there is still no front image', () => {
        const after = refreshPackagingHeatmapInSnapshot(baseSnapshot(), {
            packaging_heatmap_enabled: true,
            packaging_heatmap_images: { front: null, back: null },
        } as any);
        expect(heatmapSections(after)).toHaveLength(0);
    });
});
