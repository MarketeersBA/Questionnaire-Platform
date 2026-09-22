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
    it('never sends on its own — only on a deliberate action', () => {
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

    it('sends on Enter, exactly as the button does', () => {
        const { onSubmit } = renderInput();

        fireEvent.keyDown(screen.getByPlaceholderText('اكتب إجابتك هنا...'), { key: 'Enter' });

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith('المرارة');
    });

    it('starts a new line on Shift+Enter instead of sending', () => {
        const { onSubmit } = renderInput();

        fireEvent.keyDown(screen.getByPlaceholderText('اكتب إجابتك هنا...'), {
            key: 'Enter',
            shiftKey: true,
        });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not send while an input method is composing a word', () => {
        // Enter commits the candidate word; treating it as send would cut the
        // respondent off mid-word.
        const { onSubmit } = renderInput();

        const textarea = screen.getByPlaceholderText('اكتب إجابتك هنا...');
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        Object.defineProperty(event, 'isComposing', { value: true });
        textarea.dispatchEvent(event);

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('ignores Enter on an empty answer', () => {
        const { onSubmit } = renderInput({ value: { text: '   ' } });

        fireEvent.keyDown(screen.getByPlaceholderText('اكتب إجابتك هنا...'), { key: 'Enter' });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('ignores Enter while a previous answer is still processing', () => {
        const { onSubmit } = renderInput({ submitBusy: true });

        fireEvent.keyDown(screen.getByPlaceholderText('اكتب إجابتك هنا...'), { key: 'Enter' });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does nothing on Enter when the question has no AI moderation', () => {
        render(
            <OpenEndAnswerInput
                value={{ text: 'x' }}
                onChange={() => {}}
                questionId="q3"
                language="ar"
                showVoice={false}
            />,
        );
        // No handler to call, and no crash from pressing Enter.
        fireEvent.keyDown(screen.getByPlaceholderText('اكتب إجابتك هنا...'), { key: 'Enter' });
        expect(screen.queryByRole('button', { name: 'إرسال' })).toBeNull();
    });
});
