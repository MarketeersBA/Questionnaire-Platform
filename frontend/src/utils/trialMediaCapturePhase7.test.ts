import { describe, expect, it } from 'vitest';
import { buildProductTestSubmission, validateProductTestSection } from './productTestFlowOrchestration';
import { validateTrialMediaFile, mapTrialMediaUploadError } from './productTestMediaAnswer';
import { resolveTrialMediaClientLimits } from './productTestMediaAnswer';
import { isTrialMediaRespondentUploadEnabled } from './trialMediaRollout';
import type { ProductTestSnapshot } from '../types/productTestRespondent';

const mediaQuestion = {
    id: 'pt_trial_media_upload',
    text: 'Upload trial media',
    type: 'media-upload',
    options: [],
    required: true,
    timing: 'after_use' as const,
    diagnostic_tag: 'PF' as const,
    questionMeta: {
        nature: 'fixed',
        inputType: 'media-upload',
        acceptedMedia: 'image_or_video' as const,
        maxImageMb: 5,
        maxVideoMb: 25,
        maxVideoDurationSeconds: 60,
    },
} as unknown as ProductTestRespondentQuestion;

const mediaSnapshot: ProductTestSnapshot = {
    version: 1,
    language: 'en',
    phases: [
        {
            timing: 'after_use',
            label: 'After Use',
            sections: [
                {
                    id: 'trial_media_capture',
                    title: 'Trial Media',
                    module: 'trial_media_capture',
                    timing: 'after_use',
                    questions: [mediaQuestion],
                },
            ],
        },
    ],
    meta: { totalQuestions: 1, sectionCount: 1, phaseCount: 1, generatedAt: '2026-01-01' },
};

describe('Phase 7 respondent media flow', () => {
    it('validateProductTestSection blocks until upload reference exists', () => {
        const section = mediaSnapshot.phases[0].sections[0];
        expect(validateProductTestSection({}, section, 'en')).toHaveLength(1);

        const complete = validateProductTestSection(
            {
                pt_trial_media_upload: {
                    asset_id: 'asset-1',
                    media_type: 'image',
                    mime: 'image/jpeg',
                    size_bytes: 100,
                    uploaded_at: '2026-01-01T00:00:00Z',
                },
            },
            section,
            'en',
        );
        expect(complete).toHaveLength(0);
    });

    it('buildProductTestSubmission preserves media reference in flat_evaluations', () => {
        const mediaRef = {
            asset_id: 'asset-99',
            media_type: 'video' as const,
            mime: 'video/mp4',
            filename: 'trial.mp4',
            size_bytes: 4096,
            duration_seconds: 10,
            uploaded_at: '2026-01-01T00:00:00Z',
        };
        const payload = buildProductTestSubmission(
            { pt_trial_media_upload: mediaRef },
            mediaSnapshot,
        );
        expect(payload.flat_evaluations[0].value).toEqual(mediaRef);
        expect(payload.flat_evaluations[0].value_kind).toBe('media_reference');
        expect(payload.flat_evaluations[0].media_asset_id).toBe('asset-99');
    });

    it('client validation surfaces size and type errors', () => {
        const limits = resolveTrialMediaClientLimits(mediaQuestion);
        const pdf = new File(['x'], 'bad.pdf', { type: 'application/pdf' });
        expect(validateTrialMediaFile(pdf, limits, 'en')).toMatch(/unsupported/i);

        const err = mapTrialMediaUploadError(
            { actionable_message: 'Video too long. Max 60 seconds allowed.', status: 413, retryable: false, message: '' },
            'en',
        );
        expect(err).toMatch(/60|long/i);
    });

    it('rollout gate defaults to schema_only without respondent upload', () => {
        expect(isTrialMediaRespondentUploadEnabled()).toBe(false);
    });
});
