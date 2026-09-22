import { describe, it, expect } from 'vitest';
import { generateTasteTestModuleSchema } from './tasteTestGenerator';

/**
 * `testing_protocol: 'blind'` + `blind_codes` are a fully built creator-facing
 * feature (ParametersStep lets a creator type a code per brand) that the taste
 * test composer never read: every section title and question kept showing the
 * real brand name regardless of protocol. That's what produced surveys where
 * the section title said one shape ("مربع") while a question a few taps later
 * said another ("دايرة") — the creator had typed both as blind codes for two
 * different real brands, and neither ever made it into the schema.
 */
const masterData = {
    fixed: [
        {
            question_id: 'tt_q_overall',
            main_att: 'Overall',
            ar_text: 'ايه تقييمك لشكل المنتج ككل؟',
            en_text: 'What do you think of the product shape overall?',
            question_type: 'Scale 1-10',
            timing: 'After Taste',
            question_status: 'fixed',
        },
    ],
};

const baseConfig: any = {
    category: 'juice',
    language: 'ar',
    internal_brands_data: [{ name: 'Squizz' }],
    competitor_brands_data: [{ name: 'Kiks' }],
    attributes: {},
};

function sections(cfg: any) {
    const schema: any = generateTasteTestModuleSchema(cfg, masterData as any);
    return schema.layer2_structure?.sections || [];
}

describe('blind-coded taste tests', () => {
    it('shows the real brand name everywhere under the branded protocol', () => {
        const secs = sections({ ...baseConfig, testing_protocol: 'branded' });
        const titles = secs.map((s: any) => s.title).join(' | ');
        expect(titles).toContain('Squizz');
        expect(titles).toContain('Kiks');
        expect(titles).not.toContain('دايرة');
        expect(titles).not.toContain('مربع');
    });

    it('shows the configured blind code everywhere instead of the real name — the same code in the title and in every question for that brand', () => {
        const secs = sections({
            ...baseConfig,
            testing_protocol: 'blind',
            blind_codes: { Squizz: 'دايرة', Kiks: 'مربع' },
        });

        const squizzSections = secs.filter((s: any) => s.brand === 'Squizz');
        const kiksSections = secs.filter((s: any) => s.brand === 'Kiks');
        expect(squizzSections.length).toBeGreaterThan(0);
        expect(kiksSections.length).toBeGreaterThan(0);

        for (const s of squizzSections) {
            expect(s.title).toContain('دايرة');
            expect(s.title).not.toContain('Squizz');
            for (const q of s.questions || []) {
                expect(q.text).not.toContain('Squizz');
            }
        }
        for (const s of kiksSections) {
            expect(s.title).toContain('مربع');
            expect(s.title).not.toContain('Kiks');
            for (const q of s.questions || []) {
                expect(q.text).not.toContain('Kiks');
            }
        }

        // The instruction block ("please taste X now") must use the same code too.
        const instructions = secs.filter((s: any) => s.isInstruction);
        const instructionText = instructions.map((s: any) => `${s.title} ${s.content}`).join(' | ');
        expect(instructionText).toContain('دايرة');
        expect(instructionText).toContain('مربع');
        expect(instructionText).not.toContain('Squizz');
        expect(instructionText).not.toContain('Kiks');
    });

    it('keeps question ids and the section.brand pipeline key on the real brand name, even blind', () => {
        const secs = sections({
            ...baseConfig,
            testing_protocol: 'blind',
            blind_codes: { Squizz: 'دايرة', Kiks: 'مربع' },
        });

        const squizzSection = secs.find((s: any) => s.brand === 'Squizz');
        expect(squizzSection.brand).toBe('Squizz');
        for (const q of squizzSection.questions || []) {
            expect(q.id).not.toContain('دايرة');
        }
    });

    it('still hides the real name for a brand left unconfigured under the blind protocol, via an auto-generated sample label', () => {
        // Blind means blind for every brand in the test, not just the ones the
        // creator remembered to type a code for — otherwise the unconfigured
        // brand would be the one respondents could identify by name while its
        // competitors were disguised.
        const secs = sections({
            ...baseConfig,
            testing_protocol: 'blind',
            blind_codes: { Squizz: 'دايرة' }, // Kiks left unconfigured
        });
        const kiksSection = secs.find((s: any) => s.brand === 'Kiks');
        expect(kiksSection.title).not.toContain('Kiks');
        expect(kiksSection.title).toMatch(/Sample|العينة/);
    });

    it('the overall-preference options are blind-coded too, with the real names kept in brandOptions for scoring', () => {
        const secs = sections({
            ...baseConfig,
            testing_protocol: 'blind',
            blind_codes: { Squizz: 'دايرة', Kiks: 'مربع' },
        });
        const preference = secs.find((s: any) => s.title === 'التفضيل');
        const q = preference.questions[0];
        expect(q.options).toEqual(['دايرة', 'مربع']);
        expect(q.questionMeta.brandOptions).toEqual(['Squizz', 'Kiks']);
    });
});
