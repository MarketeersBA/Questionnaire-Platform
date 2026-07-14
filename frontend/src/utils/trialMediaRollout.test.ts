import { describe, expect, it, vi } from 'vitest';
import {
    getTrialMediaRolloutStage,
    isAtLeastTrialMediaStage,
    isTrialMediaRespondentUploadEnabled,
    TRIAL_MEDIA_ROLLOUT_STAGES,
} from './trialMediaRollout';

describe('trialMediaRollout', () => {
    it('defines two-step rollout order', () => {
        expect(TRIAL_MEDIA_ROLLOUT_STAGES).toEqual(['schema_only', 'respondent_upload']);
    });

    it('defaults to schema_only — respondent upload disabled', () => {
        vi.stubEnv('VITE_TRIAL_MEDIA_ROLLOUT_STAGE', 'schema_only');
        expect(getTrialMediaRolloutStage()).toBe('schema_only');
        expect(isTrialMediaRespondentUploadEnabled()).toBe(false);
        expect(isAtLeastTrialMediaStage('schema_only')).toBe(true);
        vi.unstubAllEnvs();
    });

    it('respondent_upload stage enables public upload UI gate', () => {
        vi.stubEnv('VITE_TRIAL_MEDIA_ROLLOUT_STAGE', 'respondent_upload');
        expect(isTrialMediaRespondentUploadEnabled()).toBe(true);
        vi.unstubAllEnvs();
    });
});
