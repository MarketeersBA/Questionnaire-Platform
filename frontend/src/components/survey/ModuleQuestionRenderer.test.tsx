// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ModuleQuestionRenderer from './ModuleQuestionRenderer';
import type { ModuleAnswerValue } from '../../types/moduleQuestions';
import type { ModuleQuestion } from '../../types/questionModules';

afterEach(() => cleanup());

const BRANDS = ['Alpha', 'Beta'];

function baseQuestion(overrides: Partial<ModuleQuestion> = {}): ModuleQuestion {
    return {
        question_id: 'pf_q3',
        type: 'mcq',
        en_text: 'Which brands have you heard of?',
        ar_text: '',
        order: 0,
        required: true,
        options: [],
        ...overrides,
    } as ModuleQuestion;
}

function Harness({ question }: { question: ModuleQuestion }) {
    const [answer, setAnswer] = useState<ModuleAnswerValue | undefined>(undefined);
    return (
        <ModuleQuestionRenderer
            question={question}
            answer={answer}
            onChange={setAnswer}
            language="en"
            brandContext={{ masterBrands: BRANDS }}
            allAnswers={{}}
        />
    );
}

/**
 * A brand-pipeline question that ALSO carries `options` used to satisfy both
 * the brand-list and option-list conditions, rendering two identical choice
 * lists stacked under one heading. That looked like the page had been split
 * into two identical halves for the same brand.
 */
describe('ModuleQuestionRenderer — choice list exclusivity', () => {
    it('renders one brand list for a brand-pipeline question that also has options', () => {
        render(
            <Harness
                question={baseQuestion({
                    brand_pipeline: { mode: 'exclude_prior', sources: [] },
                    options: [
                        { value: 'opt_1', en_label: 'Alpha', ar_label: '', order: 0 },
                        { value: 'opt_2', en_label: 'Beta', ar_label: '', order: 1 },
                    ],
                })}
            />,
        );

        // Each brand must appear exactly once — twice means both lists rendered.
        for (const brand of BRANDS) {
            expect(screen.getAllByText(brand)).toHaveLength(1);
        }
    });

    it('still renders the option list when there is no brand pipeline', () => {
        render(
            <Harness
                question={baseQuestion({
                    options: [
                        { value: 'opt_1', en_label: 'Daily', ar_label: '', order: 0 },
                        { value: 'opt_2', en_label: 'Weekly', ar_label: '', order: 1 },
                    ],
                })}
            />,
        );

        expect(screen.getAllByText('Daily')).toHaveLength(1);
        expect(screen.getAllByText('Weekly')).toHaveLength(1);
    });

    it('still renders the brand list when a brand-pipeline question has no options', () => {
        render(
            <Harness
                question={baseQuestion({
                    brand_pipeline: { mode: 'exclude_prior', sources: [] },
                })}
            />,
        );

        for (const brand of BRANDS) {
            expect(screen.getAllByText(brand)).toHaveLength(1);
        }
    });

    it('keeps the multi-select hint on a brand-pipeline mcq', () => {
        render(
            <Harness
                question={baseQuestion({
                    brand_pipeline: { mode: 'exclude_prior', sources: [] },
                })}
            />,
        );

        expect(screen.getByText('Select all that apply')).toBeTruthy();
    });

    it('lets a respondent select a brand once the duplicate list is gone', () => {
        const onChange = vi.fn();
        render(
            <ModuleQuestionRenderer
                question={baseQuestion({
                    brand_pipeline: { mode: 'exclude_prior', sources: [] },
                    options: [{ value: 'opt_1', en_label: 'Alpha', ar_label: '', order: 0 }],
                })}
                answer={undefined}
                onChange={onChange}
                language="en"
                brandContext={{ masterBrands: BRANDS }}
                allAnswers={{}}
            />,
        );

        fireEvent.click(screen.getByText('Alpha'));
        expect(onChange).toHaveBeenCalled();
    });
});
