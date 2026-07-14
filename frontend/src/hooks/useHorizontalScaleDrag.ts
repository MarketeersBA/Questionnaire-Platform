import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from 'react';
import {
    clientXToScaleValueFromRef,
    type ScaleRange,
    type TrackPadding,
} from '../utils/horizontalScaleMath';
import {
    createInitialDragState,
    isHorizontalScaleDragging,
    reduceHorizontalScaleDragState,
    type HorizontalScaleDragState,
} from '../utils/horizontalScaleDragMachine';

export interface UseHorizontalScaleDragOptions {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    trackRef: RefObject<HTMLElement>;
    thumbRef: RefObject<HTMLElement>;
    enabled?: boolean;
    /** Horizontal inset inside track container (px). Default 0. */
    trackPadding?: TrackPadding;
    /** Fire short haptic pulse when snapped value changes during drag. Default true. */
    enableHaptics?: boolean;
}

export interface HorizontalScalePointerHandlers {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface UseHorizontalScaleDragResult {
    isDragging: boolean;
    dragValue: number;
    trackHandlers: HorizontalScalePointerHandlers;
    thumbHandlers: Pick<HorizontalScalePointerHandlers, 'onPointerDown'>;
    touchActionStyle: { touchAction: 'none' };
}

const HAPTIC_PULSE_MS = 8;

function triggerHapticPulse(): void {
    try {
        navigator.vibrate?.(HAPTIC_PULSE_MS);
    } catch {
        // Vibration API unavailable or blocked — safe to ignore.
    }
}

function isThumbTarget(
    thumbRef: RefObject<HTMLElement>,
    target: EventTarget | null,
): boolean {
    return Boolean(thumbRef.current && target instanceof Node && thumbRef.current.contains(target));
}

export function useHorizontalScaleDrag(
    options: UseHorizontalScaleDragOptions,
): UseHorizontalScaleDragResult {
    const {
        value,
        min,
        max,
        onChange,
        trackRef,
        thumbRef,
        enabled = true,
        trackPadding,
        enableHaptics = true,
    } = options;

    const range: ScaleRange = { min, max };
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const [dragState, setDragState] = useState<HorizontalScaleDragState>(() =>
        createInitialDragState(value),
    );

    const dragStateRef = useRef(dragState);
    dragStateRef.current = dragState;

    const lastHapticValueRef = useRef<number | null>(null);

    useEffect(() => {
        if (dragStateRef.current.phase !== 'idle') {
            return;
        }

        setDragState((prev) =>
            prev.liveValue === value ? prev : { ...prev, liveValue: value },
        );
    }, [value]);

    const resolveValue = useCallback(
        (clientX: number): number | null =>
            clientXToScaleValueFromRef(clientX, trackRef, range, trackPadding),
        [trackRef, min, max, trackPadding],
    );

    const dispatch = useCallback(
        (
            event: Parameters<typeof reduceHorizontalScaleDragState>[0]['event'],
            captureTarget?: HTMLElement | null,
        ) => {
            if (!enabled) {
                return;
            }

            const onValueChange = (nextValue: number) => {
                onChangeRef.current(nextValue);
            };

            const onHaptic = (nextValue: number) => {
                if (!enableHaptics) {
                    return;
                }

                if (lastHapticValueRef.current === nextValue) {
                    return;
                }

                lastHapticValueRef.current = nextValue;
                triggerHapticPulse();
            };

            const { state: nextState } = reduceHorizontalScaleDragState({
                state: dragStateRef.current,
                event,
                resolveValue,
                onValueChange,
                onHaptic,
            });

            dragStateRef.current = nextState;
            setDragState(nextState);

            if (
                captureTarget &&
                (event.type === 'THUMB_POINTER_DOWN' || event.type === 'TRACK_POINTER_DOWN')
            ) {
                captureTarget.setPointerCapture(event.pointerId);
            }

            if (event.type === 'POINTER_UP' || event.type === 'POINTER_CANCEL') {
                lastHapticValueRef.current = null;
            }
        },
        [enabled, resolveValue, enableHaptics],
    );

    const handleThumbPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (!enabled || event.button !== 0) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            dispatch(
                {
                    type: 'THUMB_POINTER_DOWN',
                    pointerId: event.pointerId,
                    clientX: event.clientX,
                },
                event.currentTarget,
            );
        },
        [dispatch, enabled],
    );

    const handleTrackPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (!enabled || event.button !== 0) {
                return;
            }

            if (isThumbTarget(thumbRef, event.target)) {
                return;
            }

            event.preventDefault();

            dispatch(
                {
                    type: 'TRACK_POINTER_DOWN',
                    pointerId: event.pointerId,
                    clientX: event.clientX,
                },
                event.currentTarget,
            );
        },
        [dispatch, enabled, thumbRef],
    );

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (!enabled || dragStateRef.current.phase === 'idle') {
                return;
            }

            if (dragStateRef.current.pointerId !== event.pointerId) {
                return;
            }

            event.preventDefault();

            dispatch({
                type: 'POINTER_MOVE',
                pointerId: event.pointerId,
                clientX: event.clientX,
            });
        },
        [dispatch, enabled],
    );

    const handlePointerEnd = useCallback(
        (event: ReactPointerEvent<HTMLElement>, type: 'POINTER_UP' | 'POINTER_CANCEL') => {
            if (!enabled) {
                return;
            }

            if (dragStateRef.current.pointerId !== event.pointerId) {
                return;
            }

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }

            dispatch({ type, pointerId: event.pointerId });
        },
        [dispatch, enabled],
    );

    const handlePointerUp = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => handlePointerEnd(event, 'POINTER_UP'),
        [handlePointerEnd],
    );

    const handlePointerCancel = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => handlePointerEnd(event, 'POINTER_CANCEL'),
        [handlePointerEnd],
    );

    return {
        isDragging: isHorizontalScaleDragging(dragState),
        dragValue: dragState.liveValue,
        trackHandlers: {
            onPointerDown: handleTrackPointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerCancel,
        },
        thumbHandlers: {
            onPointerDown: handleThumbPointerDown,
        },
        touchActionStyle: { touchAction: 'none' },
    };
}
