import { describe, expect, it, vi } from 'vitest';
import {
    createInitialDragState,
    isHorizontalScaleDragging,
    reduceHorizontalScaleDragState,
} from './horizontalScaleDragMachine';

describe('horizontalScaleDragMachine', () => {
    const resolveValue = (clientX: number) => Math.min(5, Math.max(1, Math.round(clientX / 50)));

    it('starts idle with the committed value', () => {
        const state = createInitialDragState(3);

        expect(state).toEqual({
            phase: 'idle',
            pointerId: null,
            liveValue: 3,
        });
        expect(isHorizontalScaleDragging(state)).toBe(false);
    });

    it('transitions idle → dragging-thumb on thumb pointerdown', () => {
        const state = createInitialDragState(1);
        const onChange = vi.fn();

        const { state: next } = reduceHorizontalScaleDragState({
            state,
            event: { type: 'THUMB_POINTER_DOWN', pointerId: 1, clientX: 150 },
            resolveValue,
            onValueChange: onChange,
        });

        expect(next.phase).toBe('dragging-thumb');
        expect(next.pointerId).toBe(1);
        expect(onChange).toHaveBeenCalledWith(3);
        expect(isHorizontalScaleDragging(next)).toBe(true);
    });

    it('transitions idle → dragging-track on track pointerdown (jump)', () => {
        const state = createInitialDragState(1);
        const onChange = vi.fn();

        const { state: next } = reduceHorizontalScaleDragState({
            state,
            event: { type: 'TRACK_POINTER_DOWN', pointerId: 2, clientX: 200 },
            resolveValue,
            onValueChange: onChange,
        });

        expect(next.phase).toBe('dragging-track');
        expect(onChange).toHaveBeenCalledWith(4);
    });

    it('updates value on pointermove while dragging', () => {
        let state = createInitialDragState(1);
        const onChange = vi.fn();

        ({ state } = reduceHorizontalScaleDragState({
            state,
            event: { type: 'THUMB_POINTER_DOWN', pointerId: 1, clientX: 50 },
            resolveValue,
            onValueChange: onChange,
        }));

        ({ state } = reduceHorizontalScaleDragState({
            state,
            event: { type: 'POINTER_MOVE', pointerId: 1, clientX: 200 },
            resolveValue,
            onValueChange: onChange,
        }));

        expect(state.phase).toBe('dragging-thumb');
        expect(state.liveValue).toBe(4);
        expect(onChange).toHaveBeenLastCalledWith(4);
    });

    it('returns to idle on pointerup', () => {
        let state = createInitialDragState(2);

        ({ state } = reduceHorizontalScaleDragState({
            state,
            event: { type: 'THUMB_POINTER_DOWN', pointerId: 1, clientX: 100 },
            resolveValue,
        }));

        ({ state } = reduceHorizontalScaleDragState({
            state,
            event: { type: 'POINTER_UP', pointerId: 1 },
            resolveValue,
        }));

        expect(state.phase).toBe('idle');
        expect(state.pointerId).toBeNull();
        expect(isHorizontalScaleDragging(state)).toBe(false);
    });

    it('ignores pointermove from a non-active pointer id', () => {
        const state = createInitialDragState(2);
        const onChange = vi.fn();

        const dragging = reduceHorizontalScaleDragState({
            state,
            event: { type: 'THUMB_POINTER_DOWN', pointerId: 1, clientX: 100 },
            resolveValue,
        }).state;

        const { state: unchanged } = reduceHorizontalScaleDragState({
            state: dragging,
            event: { type: 'POINTER_MOVE', pointerId: 99, clientX: 250 },
            resolveValue,
            onValueChange: onChange,
        });

        expect(unchanged.liveValue).toBe(dragging.liveValue);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('does not accept external value sync while dragging', () => {
        const dragging = {
            phase: 'dragging-thumb' as const,
            pointerId: 1,
            liveValue: 3,
        };

        const { state } = reduceHorizontalScaleDragState({
            state: dragging,
            event: { type: 'EXTERNAL_VALUE', value: 5 },
            resolveValue,
        });

        expect(state.liveValue).toBe(3);
    });

    it('fires haptic callback only when value changes', () => {
        const state = createInitialDragState(2);
        const onHaptic = vi.fn();

        reduceHorizontalScaleDragState({
            state,
            event: { type: 'POINTER_MOVE', pointerId: 1, clientX: 100 },
            resolveValue,
            onHaptic,
        });

        expect(onHaptic).not.toHaveBeenCalled();

        reduceHorizontalScaleDragState({
            state,
            event: { type: 'THUMB_POINTER_DOWN', pointerId: 1, clientX: 150 },
            resolveValue,
            onHaptic,
        });

        expect(onHaptic).toHaveBeenCalledTimes(1);

        reduceHorizontalScaleDragState({
            state: { phase: 'dragging-thumb', pointerId: 1, liveValue: 3 },
            event: { type: 'POINTER_MOVE', pointerId: 1, clientX: 152 },
            resolveValue,
            onHaptic,
        });

        expect(onHaptic).toHaveBeenCalledTimes(1);
    });
});
