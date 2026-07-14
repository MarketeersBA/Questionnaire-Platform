import { describe, expect, it, vi } from 'vitest';
import { isAtLeastModuleStage, MODULE_ROLLOUT_STAGES } from './moduleRollout';

describe('moduleRollout', () => {
    it('defines staged rollout order', () => {
        expect(MODULE_ROLLOUT_STAGES[0]).toBe('seed_only');
        expect(MODULE_ROLLOUT_STAGES[MODULE_ROLLOUT_STAGES.length - 1]).toBe('full');
    });

    it('full stage enables usage_pricing gate', () => {
        vi.stubEnv('VITE_MODULE_ROLLOUT_STAGE', 'full');
        expect(isAtLeastModuleStage('usage_pricing')).toBe(true);
        vi.unstubAllEnvs();
    });

    it('seed_only stage blocks generic renderer', () => {
        vi.stubEnv('VITE_MODULE_ROLLOUT_STAGE', 'seed_only');
        expect(isAtLeastModuleStage('generic_renderer')).toBe(false);
        vi.unstubAllEnvs();
    });
});
