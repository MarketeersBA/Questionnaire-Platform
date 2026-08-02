// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HorizontalScaleSlider from './HorizontalScaleSlider';

afterEach(() => cleanup());

function SliderHarness({
    initialValue = 1,
    max = 5,
}: {
    initialValue?: number;
    max?: number;
}) {
    const [value, setValue] = useState(initialValue);

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

    it('supports thumb drag without locking body overflow', async () => {
        render(<SliderHarness initialValue={1} max={5} />);

        const thumb = screen.getAllByRole('slider').find((el) => el.tagName !== 'INPUT');
        expect(thumb).toBeDefined();
        const track = thumb!.parentElement as HTMLElement;

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

        fireEvent.pointerDown(thumb!, { button: 0, pointerId: 1, clientX: 10 });
        expect(document.body.style.overflow).toBe('');

        fireEvent.pointerMove(track, { pointerId: 1, clientX: 290 });
        await waitFor(() => expect(thumb!.getAttribute('aria-valuenow')).toBe('5'));
        expect(Boolean(screen.getByText('5'))).toBe(true);

        fireEvent.pointerUp(track, { pointerId: 1 });
        expect(document.body.style.overflow).toBe('');
    });

    it('supports track tap jump', async () => {
        render(<SliderHarness initialValue={1} max={5} />);

        const thumb = screen.getAllByRole('slider').find((el) => el.tagName !== 'INPUT');
        const track = thumb!.parentElement as HTMLElement;
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

        fireEvent.pointerDown(track, { button: 0, pointerId: 3, clientX: 150, target: track });
        await waitFor(() => expect(thumb!.getAttribute('aria-valuenow')).toBe('3'));
    });
});
