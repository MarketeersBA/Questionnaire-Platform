/**
 * Staged rollout for DB-driven survey modules (Phase 9).
 * Mirrors backend/utils/module_rollout_flags.py
 */

export const MODULE_ROLLOUT_STAGES = [
    'seed_only',
    'generic_renderer',
    'pf_from_db',
    'usage_pricing',
    'analytics_aliases',
    'full',
] as const;

export type ModuleRolloutStage = (typeof MODULE_ROLLOUT_STAGES)[number];

function stageIndex(stage: string): number {
    const idx = MODULE_ROLLOUT_STAGES.indexOf(stage as ModuleRolloutStage);
    return idx >= 0 ? idx : MODULE_ROLLOUT_STAGES.indexOf('full');
}

export function getModuleRolloutStage(): ModuleRolloutStage {
    const raw = (import.meta.env.VITE_MODULE_ROLLOUT_STAGE || 'full').trim().toLowerCase();
    return (MODULE_ROLLOUT_STAGES.includes(raw as ModuleRolloutStage)
        ? raw
        : 'full') as ModuleRolloutStage;
}

export function isAtLeastModuleStage(minStage: ModuleRolloutStage): boolean {
    return stageIndex(getModuleRolloutStage()) >= stageIndex(minStage);
}

export const moduleRollout = {
    stage: getModuleRolloutStage,
    genericRenderer: () => isAtLeastModuleStage('generic_renderer'),
    pfFromDb: () => isAtLeastModuleStage('pf_from_db'),
    usagePricing: () => isAtLeastModuleStage('usage_pricing'),
    analyticsAliases: () => isAtLeastModuleStage('analytics_aliases'),
};
