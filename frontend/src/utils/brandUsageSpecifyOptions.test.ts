import { describe, expect, it } from 'vitest';
import { resolveBrandPricingBehaviorModule } from './brandPricingBehaviorModuleUtils';
import { resolveBrandUsageModule } from './brandUsageModuleUtils';
import type { QuestionModule } from '../types/questionModules';

function snapshot(moduleId: string, questionId: string, optionValue: string, label: string): QuestionModule {
    return {
        module_id: moduleId,
        name: moduleId,
        version: 1,
        is_active: true,
        question_count: 1,
        sections: [
            {
                section_id: 's1',
                title_en: 'Section',
                title_ar: 'قسم',
                order: 1,
                questions: [
                    {
                        question_id: questionId,
                        type: 'mcq',
                        en_text: 'Question',
                        ar_text: 'سؤال',
                        order: 1,
                        required: true,
                        options: [
                            {
                                value: optionValue,
                                en_label: label,
                                ar_label: label,
                                order: 1,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe('module specify option enrichment', () => {
    it('restores brand usage specify metadata from stale snapshots', async () => {
        const module = await resolveBrandUsageModule({
            module_snapshots: {
                brand_usage: snapshot('brand_usage', 'us_q3', 'as_needed', 'As needed (Specify)'),
            },
        });

        expect(module.sections[0].questions[0].options?.[0].allows_specify).toBe(true);
    });

    it('restores brand pricing specify metadata from stale snapshots', async () => {
        const module = await resolveBrandPricingBehaviorModule({
            module_snapshots: {
                brand_pricing_behavior: snapshot('brand_pricing_behavior', 'cb_q3', 'online_other', 'Online (Specify)'),
            },
        });

        expect(module.sections[0].questions[0].options?.[0].allows_specify).toBe(true);
    });
});
