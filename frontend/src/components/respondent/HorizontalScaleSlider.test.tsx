// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HorizontalScaleSlider from './HorizontalScaleSlider';

afterEach(() => cleanup());

function SliderHarness({
    initialValue = null as number | null,
    max = 5,
}: {
    initialValue?: number | null;
    max?: number;
}) {
    const [value, setValue] = useState<number | null>(initialValue);

    return (
        <HorizontalScaleSlider
            value={value}
            max={max}
            onChange={setValue}
            language="en"
            minLabel="Not at all"
            maxLabel="Extremely"
            size="large"
        />
    );
}

describe('HorizontalScaleSlider interactions', () => {
    beforeEach(() => {
        window.sessionStorage.clear();

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
    });

    it('selects a value by tapping a number button', () => {
        render(<SliderHarness max={5} />);

        fireEvent.click(screen.getByRole('button', { name: '4' }));
        expect(screen.getByRole('button', { name: '4' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('keeps no selection until the respondent taps', () => {
        render(<SliderHarness initialValue={null} max={10} />);

        for (let n = 1; n <= 10; n += 1) {
            expect(screen.getByRole('button', { name: String(n) })).toHaveAttribute(
                'aria-pressed',
                'false',
            );
        }
    });

    it('shows tap guidance instead of drag guidance', () => {
        render(<SliderHarness max={5} />);
        expect(screen.getByText('Tap a number to select')).toBeTruthy();
    });
});
