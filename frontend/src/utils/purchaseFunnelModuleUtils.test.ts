import { describe, expect, it } from 'vitest';
import {
    buildFallbackPurchaseFunnelModule,
    buildPurchaseFunnelSubmissionPayload,
    generateLayer4FromModule,
} from './purchaseFunnelModuleUtils';

describe('purchaseFunnelModuleUtils', () => {
    it('fallback module uses pf_q1–pf_q7 IDs', () => {
        const mod = buildFallbackPurchaseFunnelModule();
        const ids = mod.sections.flatMap((s) => s.questions.map((q) => q.question_id));
        expect(ids).toEqual(['pf_q1', 'pf_q2', 'pf_q3', 'pf_q4', 'pf_q5', 'pf_q6', 'pf_q7']);
    });

    it('maps pf answers to legacy keys on submit', () => {
        const payload = buildPurchaseFunnelSubmissionPayload({
            pf_q1: 'Nike',
            pf_q4: ['Nike', 'Adidas'],
            pf_q7: 'Nike',
        });
        expect(payload.pf_q1).toBe('Nike');
        expect(payload.aw_q1).toBe('Nike');
        expect(payload.pb_q1).toEqual(['Nike', 'Adidas']);
        expect(payload.pb_q4).toBe('Nike');
    });

    it('generates layer4 schema from module doc', () => {
        const mod = buildFallbackPurchaseFunnelModule();
        const schema = generateLayer4FromModule(
            mod,
            { is_enabled: true, category_name: 'Chocolate', brand_list: [] },
            { language: 'en', category: 'Chocolate' }
        );
        expect(schema.sections).toHaveLength(2);
        expect(schema.sections[0].questions[0].id).toBe('pf_q1');
    });
});
