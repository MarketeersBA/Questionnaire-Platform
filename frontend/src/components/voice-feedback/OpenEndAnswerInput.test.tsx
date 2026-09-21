// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import OpenEndAnswerInput from './OpenEndAnswerInput';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

function renderInput(props: Partial<React.ComponentProps<typeof OpenEndAnswerInput>> = {}) {
    const onSubmit = vi.fn();
    const onBlur = vi.fn();
    render(
        <OpenEndAnswerInput
            value={{ text: 'المرارة' }}
            onChange={() => {}}
            questionId="q1"
            language="ar"
            showVoice={false}
            onSubmit={onSubmit}
            onBlur={onBlur}
            {...props}
        />,
    );
    return { onSubmit, onBlur };
}

describe('the open-end answer field', () => {
    it('sends only when the respondent presses the button', () => {
        vi.useFakeTimers();
        const { onSubmit } = renderInput();

        // No idle timer may submit on the respondent's behalf.
        vi.advanceTimersByTime(60_000);
        expect(onSubmit).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'إرسال' }));
        expect(onSubmit).toHaveBeenCalledWith('المرارة');
    });

    it('does not send merely because the field lost focus', () => {
        // Tapping outside the box, or scrolling on a phone, used to fire the
        // moderator at a half-written answer.
        const { onSubmit } = renderInput();

        fireEvent.blur(screen.getByPlaceholderText('اكتب إجابتك هنا...'));

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('puts the button on the same line as the text, inside the field', () => {
        renderInput();
        const textarea = screen.getByPlaceholderText('اكتب إجابتك هنا...');
        const button = screen.getByRole('button', { name: 'إرسال' });
        const field = textarea.parentElement as HTMLElement;

        // Direct siblings in a flex row — not stacked, which left a band of
        // dead space under the text.
        expect(button.parentElement).toBe(field);
        expect(field.className).toContain('flex');
        expect(field.className).not.toContain('flex-col');

        // The outline belongs to the row, so both sit within the visible box.
        expect(field.className).toContain('border-2');
        expect(textarea.className).toContain('border-0');
    });

    it('labels the button in the respondent language', () => {
        renderInput();
        expect(screen.getByRole('button', { name: 'إرسال' })).toBeTruthy();

        cleanup();
        renderInput({ language: 'en', value: { text: 'bitter' } });
        expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    });

    it('shows no button at all when the question has no AI moderation', () => {
        // Questions without AIMI keep the plain field they always had.
        render(
            <OpenEndAnswerInput
                value={{ text: 'x' }}
                onChange={() => {}}
                questionId="q2"
                language="ar"
                showVoice={false}
            />,
        );
        expect(screen.queryByRole('button', { name: 'إرسال' })).toBeNull();
    });

    it('cannot send an empty or whitespace answer', () => {
        const { onSubmit } = renderInput({ value: { text: '   ' } });
        const button = screen.getByRole('button', { name: 'إرسال' }) as HTMLButtonElement;

        expect(button.disabled).toBe(true);
        fireEvent.click(button);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('is disabled while a previous answer is still being processed', () => {
        renderInput({ submitBusy: true });
        expect((screen.getByRole('button', { name: 'إرسال' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
