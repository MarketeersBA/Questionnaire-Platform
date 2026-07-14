/**
 * Phased rollout for trial media capture (Phase 7).
 * Mirrors backend/utils/trial_media_rollout_flags.py
 */

export const TRIAL_MEDIA_ROLLOUT_STAGES = [
    'schema_only',
    'respondent_upload',
] as const;

export type TrialMediaRolloutStage = (typeof TRIAL_MEDIA_ROLLOUT_STAGES)[number];

function stageIndex(stage: string): number {
    const idx = TRIAL_MEDIA_ROLLOUT_STAGES.indexOf(stage as TrialMediaRolloutStage);
    return idx >= 0 ? idx : 0;
}

export function getTrialMediaRolloutStage(): TrialMediaRolloutStage {
    const raw = (import.meta.env.VITE_TRIAL_MEDIA_ROLLOUT_STAGE || 'schema_only').trim().toLowerCase();
    return (TRIAL_MEDIA_ROLLOUT_STAGES.includes(raw as TrialMediaRolloutStage)
        ? raw
        : 'schema_only') as TrialMediaRolloutStage;
}

export function isAtLeastTrialMediaStage(minStage: TrialMediaRolloutStage): boolean {
    return stageIndex(getTrialMediaRolloutStage()) >= stageIndex(minStage);
}

export function isTrialMediaSchemaEnabled(): boolean {
    return isAtLeastTrialMediaStage('schema_only');
}

export function isTrialMediaRespondentUploadEnabled(): boolean {
    return isAtLeastTrialMediaStage('respondent_upload');
}

export const trialMediaRollout = {
    stage: getTrialMediaRolloutStage,
    schema: isTrialMediaSchemaEnabled,
    respondentUpload: isTrialMediaRespondentUploadEnabled,
};
