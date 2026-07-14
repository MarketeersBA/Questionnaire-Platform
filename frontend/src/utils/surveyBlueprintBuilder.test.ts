import { describe, expect, it } from 'vitest';
import {
    buildSurveyBlueprint,
    restoreProductTestConfigFromSurvey,
    resolveClonedL2Snapshot,
} from './surveyBlueprintBuilder';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';
import { SurveyFormData, DEFAULT_TASTE_CONFIG } from '../pages/CreateSurvey/types';

describe('surveyBlueprintBuilder', () => {
    it('buildSurveyBlueprint embeds product_test block', () => {
        const formData = {
            survey_type: 'product_test',
            config: { ...DEFAULT_TASTE_CONFIG, category: 'Foam' },
            product_test_config: {
                version: 1,
                language: 'ar',
                selected_attributes: ['Product Appearance'],
                fixed_questions: ['pt_q08'],
                optional_questions: [],
                package_test_enabled: true,
                package_test_attributes: ['Pack Shape'],
                packaging_heatmap_enabled: true,
                packaging_heatmap_images: {
                    front: {
                        asset_id: 'img1',
                        side: 'front',
                        survey_id: 's1',
                        width: 100,
                        height: 100,
                        mime: 'image/png',
                        uploaded_at: '2026-06-30T00:00:00Z',
                    },
                    back: null,
                },
                trial_media_capture: {
                    enabled: true,
                    accepted_media: 'video',
                    required: true,
                    timing: 'during_use',
                    prompt_en: 'Upload video',
                    prompt_ar: 'ارفع فيديو',
                    max_video_duration_seconds: 45,
                    max_image_mb: 5,
                    max_video_mb: 25,
                },
                status: 'draft',
            },
        } as SurveyFormData;

        const blueprint = buildSurveyBlueprint(formData);
        expect(blueprint.survey_type).toBe('product_test');
        expect(blueprint.product_test?.language).toBe('ar');
        expect(blueprint.product_test?.selected_attributes).toEqual(['Product Appearance']);
        expect(blueprint.product_test?.package_test_enabled).toBe(true);
        expect(blueprint.product_test?.packaging_heatmap_enabled).toBe(true);
        expect(blueprint.product_test?.packaging_heatmap_images?.front?.asset_id).toBe('img1');
        expect(blueprint.product_test?.trial_media_capture?.enabled).toBe(true);
        expect(blueprint.product_test?.trial_media_capture?.max_video_duration_seconds).toBe(45);
    });

    it('restoreProductTestConfigFromSurvey prefers product_test_config field', () => {
        const restored = restoreProductTestConfigFromSurvey({
            product_test_config: {
                version: 1,
                language: 'en',
                selected_attributes: ['A'],
                fixed_questions: [],
                optional_questions: [],
                package_test_enabled: false,
                package_test_attributes: [],
                packaging_heatmap_enabled: false,
                packaging_heatmap_images: { front: null, back: null },
                trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
                status: 'draft',
            },
        });
        expect(restored?.selected_attributes).toEqual(['A']);
    });

    it('restoreProductTestConfigFromSurvey falls back to blueprint.product_test', () => {
        const restored = restoreProductTestConfigFromSurvey({
            blueprint: {
                product_test: {
                    language: 'ar',
                    selected_attributes: ['B'],
                    fixed_questions: ['pt_q01'],
                    optional_questions: [],
                    package_test_enabled: true,
                    package_test_attributes: [],
                    trial_media_capture: {
                        enabled: false,
                        accepted_media: 'image_or_video',
                        required: false,
                        timing: 'after_use',
                        prompt_en: 'prompt',
                        prompt_ar: 'prompt',
                        max_video_duration_seconds: 60,
                        max_image_mb: 5,
                        max_video_mb: 25,
                    },
                },
            },
        });
        expect(restored?.language).toBe('ar');
        expect(restored?.fixed_questions).toEqual(['pt_q01']);
    });

    it('resolveClonedL2Snapshot prefers template_snapshot_l2 for product_test', () => {
        const l2 = resolveClonedL2Snapshot({
            template_snapshot_l2: { sections: [{ title: 'PT', questions: [] }] },
            layer2_structure: { sections: [{ title: 'Legacy', questions: [] }] },
        }, 'product_test');
        expect(l2.sections[0].title).toBe('PT');
    });
});
