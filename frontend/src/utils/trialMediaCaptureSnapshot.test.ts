import { describe, expect, it } from 'vitest';
import { buildProductTestSnapshot } from './productTestSnapshotBuilder';
import {
    TRIAL_MEDIA_CANONICAL_QUESTION_ID,
    TRIAL_MEDIA_SECTION_ID,
    appendTrialMediaCaptureToPhases,
    buildTrialMediaCaptureSnapshotMeta,
} from './trialMediaCaptureSnapshot';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';
import type { ProductTestConfig, ProductTestQuestion } from '../types/productTest';

const fixedQuestion: ProductTestQuestion = {
    question_id: 'pt_q08',
    attribute: 'Ease of Use',
    attribute_type: 'sub',
    parent_attribute: 'Preparation',
    diagnostic_tag: 'PF',
    question_type: 'scale 1-5',
    ar_text: 'ar',
    en_text: 'Ease of use',
    ar_options: null,
    en_options: null,
    timing: 'During Use',
    question_status: 'fixed',
    order: 8,
};

const baseConfig: ProductTestConfig = {
    version: 1,
    language: 'en',
    selected_attributes: [],
    fixed_questions: ['pt_q08'],
    optional_questions: [],
    package_test_enabled: false,
    package_test_attributes: [],
    packaging_heatmap_enabled: false,
    packaging_heatmap_images: { front: null, back: null },
    trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
    status: 'draft',
};

describe('trialMediaCaptureSnapshot', () => {
    it('does not inject when disabled', () => {
        const snapshot = buildProductTestSnapshot(baseConfig, [fixedQuestion], []);
        expect(snapshot.meta.totalQuestions).toBe(1);
        expect(snapshot.meta.trial_media_capture).toBeUndefined();
        expect(
            snapshot.phases.flatMap((p) => p.sections.flatMap((s) => s.questions.map((q) => q.id))),
        ).not.toContain(TRIAL_MEDIA_CANONICAL_QUESTION_ID);
    });

    it('injects one media-upload question into after_use phase by default', () => {
        const config: ProductTestConfig = {
            ...baseConfig,
            trial_media_capture: {
                ...DEFAULT_TRIAL_MEDIA_CAPTURE,
                enabled: true,
            },
        };
        const snapshot = buildProductTestSnapshot(config, [fixedQuestion], []);

        expect(snapshot.meta.totalQuestions).toBe(2);
        expect(snapshot.meta.trial_media_capture?.question_id).toBe(TRIAL_MEDIA_CANONICAL_QUESTION_ID);
        expect(snapshot.meta.trial_media_capture?.timing).toBe('after_use');

        const afterPhase = snapshot.phases.find((p) => p.timing === 'after_use');
        expect(afterPhase).toBeDefined();
        const mediaSection = afterPhase!.sections.find((s) => s.id === TRIAL_MEDIA_SECTION_ID);
        expect(mediaSection?.module).toBe('trial_media_capture');
        expect(mediaSection?.questions).toHaveLength(1);
        expect(mediaSection?.questions[0].type).toBe('media-upload');
        expect(mediaSection?.questions[0].id).toBe(TRIAL_MEDIA_CANONICAL_QUESTION_ID);
    });

    it('creates during_use phase when upload timing has no bank questions in that phase', () => {
        const beforeUseQuestion: ProductTestQuestion = {
            ...fixedQuestion,
            question_id: 'pt_q01',
            timing: 'Before Use',
            question_status: 'fixed',
        };
        const config: ProductTestConfig = {
            ...baseConfig,
            fixed_questions: ['pt_q01'],
            trial_media_capture: {
                ...DEFAULT_TRIAL_MEDIA_CAPTURE,
                enabled: true,
                timing: 'during_use',
            },
        };
        const snapshot = buildProductTestSnapshot(config, [beforeUseQuestion], []);
        const duringPhase = snapshot.phases.find((p) => p.timing === 'during_use');
        expect(duringPhase).toBeDefined();
        expect(duringPhase!.sections.some((s) => s.module === 'trial_media_capture')).toBe(true);
        expect(snapshot.meta.phaseCount).toBe(2);
        expect(snapshot.meta.totalQuestions).toBe(2);
    });

    it('appendTrialMediaCaptureToPhases preserves phase order', () => {
        const phases = appendTrialMediaCaptureToPhases(
            [{
                timing: 'before_use',
                label: 'Before Use',
                sections: [],
            }],
            {
                ...baseConfig,
                trial_media_capture: {
                    ...DEFAULT_TRIAL_MEDIA_CAPTURE,
                    enabled: true,
                    timing: 'after_use',
                },
            },
            'en',
        );
        expect(phases.map((p) => p.timing)).toEqual(['before_use', 'after_use']);
    });

    it('buildTrialMediaCaptureSnapshotMeta returns null when disabled', () => {
        expect(buildTrialMediaCaptureSnapshotMeta(baseConfig)).toBeNull();
    });
});
