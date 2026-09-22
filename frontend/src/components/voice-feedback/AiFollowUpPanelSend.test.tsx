// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AiFollowUpPanel from './AiFollowUpPanel';
import type { FollowUpPanelState } from '../../utils/aiFollowup';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const state: FollowUpPanelState = {
    questionId: 'q1',
    round: 1,
    followUpText: 'قد إيه حاسس إن الطعم الحادق كان مؤثر على تجربتك؟',
    loading: false,
    replyValue: { text: 'اه' },
} as FollowUpPanelState;

function renderPanel(overrides: Partial<React.ComponentProps<typeof AiFollowUpPanel>> = {}) {
    const onReplyTextSubmit = vi.fn();
    render(
        <AiFollowUpPanel
            visible
            state={state}
            language="ar"
            showVoice={false}
            replyQuestionId="followup-q1-1"
            onReplyChange={() => {}}
            onReplyTextSubmit={onReplyTextSubmit}
            {...overrides}
        />,
    );
    return { onReplyTextSubmit };
}

describe('sending a reply to the AI researcher', () => {
    it('never sends on its own while the respondent pauses', () => {
        // The root of the complaint: replies used to fire after an idle delay,
        // guessing at when someone had finished typing. Nothing may be sent
        // without an explicit action, however long the pause.
        vi.useFakeTimers();
        const { onReplyTextSubmit } = renderPanel();

        vi.advanceTimersByTime(60_000);

        expect(onReplyTextSubmit).not.toHaveBeenCalled();
    });

    it('sends when the respondent presses the button', () => {
        const { onReplyTextSubmit } = renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'إرسال' }));

        expect(onReplyTextSubmit).toHaveBeenCalledTimes(1);
        expect(onReplyTextSubmit).toHaveBeenCalledWith('اه');
    });

    it('does not send the same answer twice on a double tap', () => {
        const { onReplyTextSubmit } = renderPanel();
        const button = screen.getByRole('button', { name: 'إرسال' });

        fireEvent.click(button);
        fireEvent.click(button);

        // A second send would burn a probe round and re-answer the same question.
        expect(onReplyTextSubmit).toHaveBeenCalledTimes(1);
    });

    it('labels the button in the survey language', () => {
        renderPanel();
        expect(screen.getByRole('button', { name: 'إرسال' })).toBeTruthy();

        cleanup();
        renderPanel({ language: 'en' });
        expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    });

    it('puts the button inside the answer box, not below it', () => {
        renderPanel();

        const textarea = screen.getByPlaceholderText('اكتب إجابتك هنا...');
        const button = screen.getByRole('button', { name: 'إرسال' });
        const field = textarea.parentElement as HTMLElement;

        // Both live in the one element that draws the outline, so the button
        // is within the visible box rather than under it.
        expect(field.contains(button)).toBe(true);
        expect(field.className).toContain('border-2');
        expect(field.className).toContain('rounded-2xl');

        // The textarea must not draw a competing outline of its own — that is
        // what made the button appear to sit below the field.
        expect(textarea.className).toContain('border-0');
    });

    it('cannot be sent empty', () => {
        const { onReplyTextSubmit } = renderPanel({
            state: { ...state, replyValue: { text: '   ' } } as FollowUpPanelState,
        });

        const button = screen.getByRole('button', { name: 'إرسال' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);

        fireEvent.click(button);
        expect(onReplyTextSubmit).not.toHaveBeenCalled();
    });
});
