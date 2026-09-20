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
        // Plain DOM assertions: @testing-library/jest-dom is not a dependency
        // here, so its matchers silently fail as unknown Chai properties.
        expect(screen.getByRole('button', { name: '4' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: '1' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('keeps no selection until the respondent taps', () => {
        render(<SliderHarness initialValue={null} max={10} />);

        for (let n = 1; n <= 10; n += 1) {
            expect(
                screen.getByRole('button', { name: String(n) }).getAttribute('aria-pressed'),
            ).toBe('false');
        }
    });

    it('shows tap guidance instead of drag guidance', () => {
        render(<SliderHarness max={5} />);
        expect(screen.getByText('Tap a number to select')).toBeTruthy();
    });

    it('lays every point out in a single row, including the last', () => {
        // A 1-10 scale rendered with fixed-width buttons in a wrapping flex row
        // pushed "10" onto a second line, where it read as a separate option
        // rather than the top of the scale. One grid track per point keeps the
        // row intact at any width.
        render(<SliderHarness max={10} />);

        const row = screen.getByRole('button', { name: '1' }).parentElement as HTMLElement;
        expect(row.className).not.toContain('flex-wrap');
        expect(row.style.gridTemplateColumns).toBe('repeat(10, minmax(2rem, 1fr))');

        // Every point is in that one container, 10 included.
        for (let n = 1; n <= 10; n += 1) {
            expect(screen.getByRole('button', { name: String(n) }).parentElement).toBe(row);
        }
    });

    it('tracks the scale length rather than assuming ten', () => {
        render(<SliderHarness max={7} />);
        const row = screen.getByRole('button', { name: '1' }).parentElement as HTMLElement;
        expect(row.style.gridTemplateColumns).toBe('repeat(7, minmax(2rem, 1fr))');
    });
});
