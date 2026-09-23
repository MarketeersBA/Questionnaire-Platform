import { describe, it, expect } from 'vitest';
import { isModuleExplicitlyDisabled } from './moduleEnablement';
import { isBrandAnalyzerEnabled } from './brandAnalyzerModuleUtils';
import { isBrandUsageEnabled } from './brandUsageModuleUtils';
import { isBrandPricingBehaviorEnabled } from './brandPricingBehaviorModuleUtils';
import { isAnswerComplete } from './moduleQuestionUtils';

/**
 * `module_sequence` is the catalogue of every module in display order, not the
 * list of selected ones. Treating mere presence in it as "enabled" ran modules
 * the analyst had switched off — most damagingly Brand Analyzer, which then
 * rendered a required grid with no rows and left the respondent unable to
 * finish the survey.
 */
const SURVEY_AS_REPORTED = {
    selected_modules: ['screening', 'taste_test', 'purchase_funnel'],
    module_sequence: [
        'screening', 'taste_test', 'purchase_funnel',
        'brand_usage', 'brand_pricing_behavior', 'brand_analyzer',
    ],
    brand_analyzer: { is_enabled: false, selected_attributes: [], brand_list: [] },
    brand_usage: { is_enabled: false },
    brand_pricing_behavior: { is_enabled: false },
};

describe('isModuleExplicitlyDisabled', () => {
    it('is true only for an explicit false', () => {
        expect(isModuleExplicitlyDisabled({ m: { is_enabled: false } }, 'm')).toBe(true);
        expect(isModuleExplicitlyDisabled({ m: { is_enabled: true } }, 'm')).toBe(false);
        expect(isModuleExplicitlyDisabled({ m: {} }, 'm')).toBe(false);
        expect(isModuleExplicitlyDisabled({}, 'm')).toBe(false);
        expect(isModuleExplicitlyDisabled({ m: null }, 'm')).toBe(false);
    });

    it('ignores non-objects rather than throwing', () => {
        expect(isModuleExplicitlyDisabled({ m: [] }, 'm')).toBe(false);
        expect(isModuleExplicitlyDisabled({ m: 'yes' }, 'm')).toBe(false);
        expect(isModuleExplicitlyDisabled(null, 'm')).toBe(false);
    });
});

describe('a module switched off does not run', () => {
    it.each([
        ['brand_analyzer', isBrandAnalyzerEnabled],
        ['brand_usage', isBrandUsageEnabled],
        ['brand_pricing_behavior', isBrandPricingBehaviorEnabled],
    ])('%s stays off even though module_sequence lists it', (_name, predicate) => {
        expect(predicate(SURVEY_AS_REPORTED)).toBe(false);
    });

    it('still runs a module the analyst did enable', () => {
        expect(isBrandAnalyzerEnabled({
            ...SURVEY_AS_REPORTED,
            brand_analyzer: { is_enabled: true, selected_attributes: ['trustworthy'] },
        })).toBe(true);
    });

    it('keeps the legacy fallback for surveys with no flag at all', () => {
        // Saved before is_enabled existed: the sequence is the only signal.
        expect(isBrandAnalyzerEnabled({ module_sequence: ['brand_analyzer'] })).toBe(true);
    });

    it('stays off for a freshly created Sensory Test, which no longer offers it', () => {
        // The exact module_sequence IdentityStep now sets when Sensory Test is
        // selected — Brand Analyzer's quick-attach card was removed from that
        // screen, so it must not be pre-baked into the sequence either. Both
        // have to move together: leaving it in the sequence alone would
        // recreate the empty-grid bug above through a module the creator
        // never even saw an option for, let alone attached.
        expect(isBrandAnalyzerEnabled({
            module_sequence: ['screening', 'taste_test', 'purchase_funnel', 'brand_usage', 'brand_pricing_behavior'],
        })).toBe(false);
    });
});

describe('a grid with no rows cannot block the respondent', () => {
    const grid = (rows: unknown[]) => ({
        question_id: 'ba_q2_perception',
        type: 'grid' as const,
        required: true,
        questionMeta: { rows },
    });

    it('is satisfied when it asks nothing', () => {
        expect(isAnswerComplete(grid([]) as any, undefined)).toBe(true);
    });

    it('still requires an answer when it has rows', () => {
        expect(isAnswerComplete(grid([{ id: 'a', label: 'A' }]) as any, undefined)).toBe(false);
        expect(isAnswerComplete(grid([{ id: 'a', label: 'A' }]) as any, { a: ['Shaheen'] } as any)).toBe(true);
    });
});
