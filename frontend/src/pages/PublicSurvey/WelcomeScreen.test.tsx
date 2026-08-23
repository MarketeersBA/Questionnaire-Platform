// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WelcomeScreen from './WelcomeScreen';

afterEach(() => cleanup());

describe('WelcomeScreen', () => {
    it('renders Arabic copy in RTL and calls onStart when the CTA is tapped', () => {
        const onStart = vi.fn();
        render(<WelcomeScreen language="ar" onStart={onStart} />);

        expect(screen.getByText('رأيك يهمنا')).toBeTruthy();
        expect(screen.getByText('يلا نبدأ').closest('[dir]')?.getAttribute('dir')).toBe('rtl');

        fireEvent.click(screen.getByText('يلا نبدأ'));
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('renders English copy in LTR when language is en', () => {
        const onStart = vi.fn();
        render(<WelcomeScreen language="en" onStart={onStart} />);

        expect(screen.getByText('Your voice matters')).toBeTruthy();
        expect(screen.getByText("Let's Go").closest('[dir]')?.getAttribute('dir')).toBe('ltr');
    });
});
