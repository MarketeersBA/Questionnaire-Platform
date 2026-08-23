import { describe, expect, it } from 'vitest';
import {
    buildPackagingHeatmapSection,
    buildPackagingHeatmapSnapshotMeta,
    heatmapCanonicalQuestionId,
} from './packagingHeatmapSnapshot';
import { buildProductTestSnapshot } from './productTestSnapshotBuilder';
import type { ProductTestConfig } from '../types/productTest';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';
import { validateProductTestSection } from './productTestFlowOrchestration';
import type { ProductTestRespondentSection } from '../types/productTestRespondent';

const frontAsset = {
    asset_id: 'front1',
    side: 'front' as const,
    survey_id: 's1',
    width: 640,
    height: 480,
    mime: 'image/png',
    uploaded_at: '2026-06-30T00:00:00Z',
};

const baseConfig: ProductTestConfig = {
    version: 1,
    language: 'en',
    selected_attributes: [],
    fixed_questions: ['pt_q01'],
    optional_questions: [],
    package_test_enabled: false,
    package_test_attributes: [],
    packaging_heatmap_enabled: true,
    packaging_heatmap_images: { front: frontAsset, back: null },
    trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
    status: 'draft',
};

describe('packagingHeatmapSnapshot', () => {
    it('builds 3 questions for front-only config', () => {
        const section = buildPackagingHeatmapSection(
            baseConfig,
            {
                brands: ['Acme'],
                own_brand: 'Acme',
                category: 'Shampoo',
                testing_protocol: 'branded',
                blind_codes: {},
            },
            'en',
        );
        expect(section?.module).toBe('packaging_heatmap');
        expect(section?.questions).toHaveLength(3);
        expect(section?.questions[0].type).toBe('packaging-heatmap');
        expect(section?.questions[0].id).toBe('Acme_pkg_hm_front_attraction');
    });

    it('builds snapshot meta with image refs', () => {
        const meta = buildPackagingHeatmapSnapshotMeta(baseConfig);
        expect(meta?.enabled).toBe(true);
        expect(meta?.images.front?.asset_id).toBe('front1');
        expect(meta?.configured_sides).toEqual(['front']);
    });

    it('injects heatmap section into packaging phase', () => {
        const snapshot = buildProductTestSnapshot(
            baseConfig,
            [{
                question_id: 'pt_q01',
                attribute: 'Look',
                attribute_type: 'sub',
                parent_attribute: 'Appearance',
                diagnostic_tag: null,
                question_type: 'scale 1-5',
                ar_text: '',
                en_text: 'Look',
                ar_options: null,
                en_options: null,
                timing: 'Before Use',
                question_status: 'fixed',
                order: 1,
            }],
            [],
            new Date().toISOString(),
            {
                brands: ['Acme'],
                own_brand: 'Acme',
                category: 'Shampoo',
                testing_protocol: 'branded',
                blind_codes: {},
            },
        );

        const packaging = snapshot.phases.find((p) => p.timing === 'packaging');
        expect(packaging?.sections.some((s) => s.module === 'packaging_heatmap')).toBe(true);
        expect(snapshot.meta.packaging_heatmap?.enabled).toBe(true);
        expect(heatmapCanonicalQuestionId('front', 'dislikes')).toBe('pkg_hm_front_dislikes');
    });
});

describe('productTestFlowOrchestration heatmap validation', () => {
    const section: ProductTestRespondentSection = {
        id: 'hm',
        title: 'Heatmap',
        module: 'packaging_heatmap',
        timing: 'packaging',
        questions: [{
            id: 'Acme_pkg_hm_front_attraction',
            text: 'Tap',
            type: 'packaging-heatmap',
            options: [],
            required: true,
            timing: 'packaging',
            diagnostic_tag: null,
            questionMeta: { nature: 'fixed', inputType: 'packaging-heatmap' },
        }],
    };

    it('requires at least one click for heatmap answers', () => {
        expect(validateProductTestSection({
            Acme_pkg_hm_front_attraction: {
                image_side: 'front',
                intent: 'attraction',
                ref_width: 100,
                ref_height: 100,
                clicks: [],
            },
        }, section)).toHaveLength(1);

        // A pin needs a comment (or voice note) to count as answered — see
        // isHeatmapPinFeedbackAnswered / the validation message itself
        // ("Please add text or a voice note for every selected pin...").
        // A bare {x, y} click with no feedback is still incomplete.
        expect(validateProductTestSection({
            Acme_pkg_hm_front_attraction: {
                image_side: 'front',
                intent: 'attraction',
                ref_width: 100,
                ref_height: 100,
                clicks: [{ x: 0.5, y: 0.5, feedback: { comment: 'Bright color caught my eye' } }],
            },
        }, section)).toHaveLength(0);
    });
});
