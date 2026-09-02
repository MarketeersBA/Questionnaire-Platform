// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SelectMenu from './SelectMenu';
import type { SelectMenuOption } from './SelectMenu';

// jest-dom is not installed in this project, so these assert on textContent
// directly rather than using matchers like toHaveTextContent.

afterEach(() => cleanup());

const OPTIONS: SelectMenuOption[] = [
    { value: 'open_single', label: 'Text Answer', hint: 'One open-ended reply' },
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'linear_scale', label: 'Linear Scale' },
];

const trigger = () => screen.getByRole('combobox');
const triggerText = () => trigger().textContent ?? '';

function Harness({ initial = 'open_single' }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
        <SelectMenu
            value={value}
            options={OPTIONS}
            onChange={setValue}
            aria-label="Answer type"
        />
    );
}

describe('SelectMenu', () => {
    it('shows the selected option and keeps the list closed initially', () => {
        render(<Harness />);

        expect(triggerText()).toContain('Text Answer');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('falls back to the placeholder when the value matches no option', () => {
        render(
            <SelectMenu value="unknown" options={OPTIONS} onChange={vi.fn()} placeholder="Pick one" />,
        );
        expect(triggerText()).toContain('Pick one');
    });

    it('opens on click and selects the clicked option', () => {
        render(<Harness />);

        fireEvent.click(trigger());
        expect(screen.getByRole('listbox')).toBeTruthy();

        fireEvent.click(screen.getByText('Linear Scale'));

        // Closes, and the trigger reflects the new selection.
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(triggerText()).toContain('Linear Scale');
    });

    it('reports the chosen value to onChange', () => {
        const onChange = vi.fn();
        render(<SelectMenu value="open_single" options={OPTIONS} onChange={onChange} />);

        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(screen.getByText('Multiple Choice'));

        expect(onChange).toHaveBeenCalledWith('mcq');
    });

    it('marks exactly one option as aria-selected', () => {
        render(<Harness initial="mcq" />);
        fireEvent.click(trigger());

        const selected = screen
            .getAllByRole('option')
            .filter((o) => o.getAttribute('aria-selected') === 'true');

        expect(selected).toHaveLength(1);
        expect(selected[0].textContent).toContain('Multiple Choice');
    });

    it('supports keyboard selection with the arrow keys', () => {
        render(<Harness />);

        fireEvent.keyDown(trigger(), { key: 'ArrowDown' });   // opens on the current value
        fireEvent.keyDown(trigger(), { key: 'ArrowDown' });   // -> Multiple Choice
        fireEvent.keyDown(trigger(), { key: 'Enter' });

        expect(triggerText()).toContain('Multiple Choice');
    });

    it('closes on Escape without changing the selection', () => {
        render(<Harness />);

        fireEvent.click(trigger());
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('listbox')).toBeNull();
        expect(triggerText()).toContain('Text Answer');
    });

    it('closes when clicking outside', () => {
        render(<Harness />);

        fireEvent.click(trigger());
        expect(screen.getByRole('listbox')).toBeTruthy();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('does not open when disabled', () => {
        render(<SelectMenu value="mcq" options={OPTIONS} onChange={vi.fn()} disabled />);

        fireEvent.click(trigger());
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('renders the popup outside its container so overflow-hidden cannot clip it', () => {
        // Attribute cards use overflow-hidden for their rounded corners, which
        // clipped the menu when it was an in-flow absolute child.
        const { container } = render(
            <div style={{ overflow: 'hidden' }} data-testid="card">
                <Harness />
            </div>,
        );

        fireEvent.click(trigger());

        const listbox = screen.getByRole('listbox');
        expect(listbox).toBeTruthy();
        expect(container.contains(listbox)).toBe(false);
        expect(document.body.contains(listbox)).toBe(true);
    });

    it('mirrors the control when dir is rtl', () => {
        render(
            <SelectMenu value="mcq" options={OPTIONS} onChange={vi.fn()} dir="rtl" />,
        );

        expect(trigger().getAttribute('dir')).toBe('rtl');
        fireEvent.click(trigger());
        expect(screen.getByRole('listbox').getAttribute('dir')).toBe('rtl');
    });

    it('exposes the expanded state for assistive tech', () => {
        render(<Harness />);

        expect(trigger().getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(trigger());
        expect(trigger().getAttribute('aria-expanded')).toBe('true');
    });
});
