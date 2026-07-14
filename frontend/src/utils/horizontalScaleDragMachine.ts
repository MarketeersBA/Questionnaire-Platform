/**
 * Pure pointer-drag state machine for horizontal scale sliders.
 * Separated from React so transitions are unit-testable without a DOM runtime.
 */

export type HorizontalScaleDragPhase = 'idle' | 'dragging-thumb' | 'dragging-track';

export interface HorizontalScaleDragState {
    phase: HorizontalScaleDragPhase;
    pointerId: number | null;
    /** Live value while interacting; mirrors committed value when idle. */
    liveValue: number;
}

export type HorizontalScaleDragEvent =
    | { type: 'THUMB_POINTER_DOWN'; pointerId: number; clientX: number }
    | { type: 'TRACK_POINTER_DOWN'; pointerId: number; clientX: number }
    | { type: 'POINTER_MOVE'; pointerId: number; clientX: number }
    | { type: 'POINTER_UP'; pointerId: number }
    | { type: 'POINTER_CANCEL'; pointerId: number }
    | { type: 'EXTERNAL_VALUE'; value: number };

export interface ReduceHorizontalScaleDragStateOptions {
    state: HorizontalScaleDragState;
    event: HorizontalScaleDragEvent;
    resolveValue: (clientX: number) => number | null;
    onValueChange?: (value: number) => void;
    onHaptic?: (value: number) => void;
}

export interface ReduceHorizontalScaleDragStateResult {
    state: HorizontalScaleDragState;
    /** True when resolveValue produced a new committed value. */
    valueChanged: boolean;
}

export function createInitialDragState(value: number): HorizontalScaleDragState {
    return {
        phase: 'idle',
        pointerId: null,
        liveValue: value,
    };
}

function isActivePointer(state: HorizontalScaleDragState, pointerId: number): boolean {
    return state.pointerId === pointerId;
}

function commitValue(
    state: HorizontalScaleDragState,
    nextValue: number,
    onValueChange?: (value: number) => void,
    onHaptic?: (value: number) => void,
): { state: HorizontalScaleDragState; valueChanged: boolean } {
    const valueChanged = nextValue !== state.liveValue;

    if (valueChanged) {
        onValueChange?.(nextValue);
        onHaptic?.(nextValue);
    }

    return {
        state: { ...state, liveValue: nextValue },
        valueChanged,
    };
}

function applyResolvedValue(
    state: HorizontalScaleDragState,
    clientX: number,
    resolveValue: (clientX: number) => number | null,
    onValueChange?: (value: number) => void,
    onHaptic?: (value: number) => void,
): ReduceHorizontalScaleDragStateResult {
    const resolved = resolveValue(clientX);

    if (resolved == null) {
        return { state, valueChanged: false };
    }

    const { state: nextState, valueChanged } = commitValue(
        state,
        resolved,
        onValueChange,
        onHaptic,
    );

    return { state: nextState, valueChanged };
}

/**
 * Reduce drag state for a single pointer event.
 */
export function reduceHorizontalScaleDragState(
    options: ReduceHorizontalScaleDragStateOptions,
): ReduceHorizontalScaleDragStateResult {
    const { state, event, resolveValue, onValueChange, onHaptic } = options;

    switch (event.type) {
        case 'EXTERNAL_VALUE': {
            if (state.phase !== 'idle') {
                return { state, valueChanged: false };
            }

            return {
                state: { ...state, liveValue: event.value },
                valueChanged: false,
            };
        }

        case 'THUMB_POINTER_DOWN': {
            if (state.phase !== 'idle') {
                return { state, valueChanged: false };
            }

            const dragging: HorizontalScaleDragState = {
                phase: 'dragging-thumb',
                pointerId: event.pointerId,
                liveValue: state.liveValue,
            };

            return applyResolvedValue(
                dragging,
                event.clientX,
                resolveValue,
                onValueChange,
                onHaptic,
            );
        }

        case 'TRACK_POINTER_DOWN': {
            if (state.phase !== 'idle') {
                return { state, valueChanged: false };
            }

            const jumping: HorizontalScaleDragState = {
                phase: 'dragging-track',
                pointerId: event.pointerId,
                liveValue: state.liveValue,
            };

            return applyResolvedValue(
                jumping,
                event.clientX,
                resolveValue,
                onValueChange,
                onHaptic,
            );
        }

        case 'POINTER_MOVE': {
            if (state.phase === 'idle' || !isActivePointer(state, event.pointerId)) {
                return { state, valueChanged: false };
            }

            return applyResolvedValue(
                state,
                event.clientX,
                resolveValue,
                onValueChange,
                onHaptic,
            );
        }

        case 'POINTER_UP':
        case 'POINTER_CANCEL': {
            if (!isActivePointer(state, event.pointerId)) {
                return { state, valueChanged: false };
            }

            return {
                state: {
                    phase: 'idle',
                    pointerId: null,
                    liveValue: state.liveValue,
                },
                valueChanged: false,
            };
        }

        default:
            return { state, valueChanged: false };
    }
}

export function isHorizontalScaleDragging(state: HorizontalScaleDragState): boolean {
    return state.phase !== 'idle';
}
