// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FollowUpRoundsSlider from './FollowUpRoundsSlider';

afterEach(() => cleanup());

describe('FollowUpRoundsSlider', () => {
    it('offers only options up to the admin-configured ceiling', () => {
        const onChange = vi.fn();
        render(<FollowUpRoundsSlider maxAllowed={2} value={1} onChange={onChange} language="en" />);

        expect(screen.getByText('1')).toBeTruthy();
        expect(screen.getByText('2')).toBeTruthy();
        expect(screen.queryByText('3')).toBeNull();
    });

    it('calls onChange with the selected round count', () => {
        const onChange = vi.fn();
        render(<FollowUpRoundsSlider maxAllowed={3} value={1} onChange={onChange} language="en" />);

        fireEvent.click(screen.getByText('3'));
        expect(onChange).toHaveBeenCalledWith(3);
    });

    it('renders nothing when the admin ceiling only allows a single round', () => {
        const onChange = vi.fn();
        const { container } = render(<FollowUpRoundsSlider maxAllowed={1} value={1} onChange={onChange} language="en" />);
        expect(container.textContent).toBe('');
    });
});
