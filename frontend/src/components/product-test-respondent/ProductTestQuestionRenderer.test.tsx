// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ProductTestQuestionRenderer from './ProductTestQuestionRenderer';
import type { ProductTestRespondentQuestion, ProductTestRespondentSection } from '../../types/productTestRespondent';
import { resolveProductTestDisplayText } from '../../utils/productTestPlaceholderEngine';
import { buildProductTestRespondentDisplayContext } from '../../utils/productTestRespondentDisplay';

afterEach(() => cleanup());

/**
 * Mirrors ProductTestQuestionRenderer display resolution (UI smoke without DOM).
 */
function resolveRendererQuestionText(
    question: ProductTestRespondentQuestion,
    section: ProductTestRespondentSection,
    survey: Parameters<typeof buildProductTestRespondentDisplayContext>[0],
): string {
    const display = buildProductTestRespondentDisplayContext(survey);
    return resolveProductTestDisplayText(question.text, {
        brand: section.brand || question.brand,
        displayBrand: section.displayBrand || question.displayBrand,
        category: display.category,
        attribute: section.title,
        language: 'en',
        testing_protocol: display.testing_protocol,
        blind_codes: display.blind_codes,
    });
}

describe('ProductTestQuestionRenderer display smoke', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
            configurable: true,
            value: vi.fn(),
        });
        Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
            configurable: true,
            value: vi.fn(),
        });
        Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
            configurable: true,
            value: vi.fn().mockReturnValue(true),
        });
    });

    const section: ProductTestRespondentSection = {
        id: 'before_use_appearance_branda',
        title: 'BrandA Appearance',
        module: 'product_test',
        timing: 'before_use',
        brand: 'BrandA',
        displayBrand: 'BrandA',
        questions: [],
    };

    const question: ProductTestRespondentQuestion = {
        id: 'BrandA_pt_q01',
        text: 'BrandA Look',
        type: 'scale',
        options: [],
        required: true,
        timing: 'before_use',
        brand: 'BrandA',
        displayBrand: 'BrandA',
        canonicalQuestionId: 'pt_q01',
        diagnostic_tag: 'overall_liking',
        questionMeta: { nature: 'fixed', inputType: 'scale', scaleMax: 5 },
    };

    it('renders blind sample code instead of brand name', () => {
        const text = resolveRendererQuestionText(question, section, {
            config: {
                testing_protocol: 'blind',
                blind_codes: { BrandA: 'SAMPLE-123' },
            },
            product_test_snapshot: {
                brand_context: {
                    brands: ['BrandA'],
                    category: 'Foam',
                    testing_protocol: 'blind',
                    blind_codes: { BrandA: 'SAMPLE-123' },
                },
            },
        });
        expect(text).toBe('SAMPLE-123 Look');
        expect(text).not.toContain('BrandA');
    });

    it('uses runtime fallback brand context on legacy snapshot', () => {
        const text = resolveRendererQuestionText(
            { ...question, text: 'Product Look' },
            { ...section, brand: undefined, displayBrand: undefined },
            {
                taste_test_config: {
                    own_brand: 'BrandA',
                    testing_protocol: 'blind',
                    blind_codes: { BrandA: 'SAMPLE-123' },
                },
                product_test_snapshot: {
                    version: 1,
                    language: 'en',
                    phases: [],
                    meta: {
                        totalQuestions: 0,
                        sectionCount: 0,
                        phaseCount: 0,
                        generatedAt: '',
                    },
                },
            },
        );
        expect(text).toContain('SAMPLE-123');
    });

    it('renders shared horizontal slider for scale questions', () => {
        const onChange = vi.fn();
        const display = buildProductTestRespondentDisplayContext({
            config: { testing_protocol: 'blind', blind_codes: { BrandA: 'SAMPLE-123' } },
            product_test_snapshot: {
                brand_context: {
                    brands: ['BrandA'],
                    category: 'Foam',
                    testing_protocol: 'blind',
                    blind_codes: { BrandA: 'SAMPLE-123' },
                },
            },
        });

        render(
            <ProductTestQuestionRenderer
                question={question}
                section={section}
                value={2}
                onChange={onChange}
                language="en"
                display={display}
            />,
        );

        expect(Boolean(screen.getByText('Drag the handle or tap the bar'))).toBe(true);
        const sliders = screen.getAllByRole('slider');
        expect(sliders.length).toBeGreaterThan(0);
    });

    it('commits scale value changes through onChange', () => {
        const onChange = vi.fn();
        const display = buildProductTestRespondentDisplayContext({
            config: { testing_protocol: 'blind', blind_codes: { BrandA: 'SAMPLE-123' } },
            product_test_snapshot: {
                brand_context: {
                    brands: ['BrandA'],
                    category: 'Foam',
                    testing_protocol: 'blind',
                    blind_codes: { BrandA: 'SAMPLE-123' },
                },
            },
        });

        render(
            <ProductTestQuestionRenderer
                question={question}
                section={section}
                value={2}
                onChange={onChange}
                language="en"
                display={display}
            />,
        );

        const thumb = screen.getAllByRole('slider').find((element) => element.tagName !== 'INPUT');
        const track = thumb?.parentElement as HTMLElement;
        expect(Boolean(track)).toBe(true);
        Object.defineProperty(track, 'getBoundingClientRect', {
            configurable: true,
            value: () =>
                ({
                    left: 0,
                    width: 300,
                    top: 0,
                    height: 64,
                    right: 300,
                    bottom: 64,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                }) as DOMRect,
        });

        fireEvent.pointerDown(track, { button: 0, pointerId: 7, clientX: 225, target: track });
        expect(onChange).toHaveBeenCalledWith(4);
    });
});
