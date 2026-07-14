import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '../services/api';

interface ActionOptions<T, Args extends any[]> {
    /** Platform Principle: "Warn before irreversible or outward-facing actions." */
    confirmMessage?: string | ((...args: Args) => string);
    /** Text shown during the operation. */
    loadingMessage?: string;
    /** Text shown on successful completion. */
    successMessage?: string;
    /** Platform Principle: "Honesty over completion." */
    errorMessage?: string | ((error: ApiError) => string);
    /** Callback on success. */
    onSuccess?: (result: T, ...args: Args) => void;
    /** Callback on failure. */
    onError?: (error: ApiError) => void;
    /** Whether the action can be cancelled. */
    cancellable?: boolean;
}

interface ActionState<T> {
    loading: boolean;
    error: ApiError | null;
    data: T | null;
}

/**
 * Platform Principles: 
 * ⚡ "Never fail silently" (Integrated Toasts)
 * ⚡ "Warn before irreversible" (Integrated Confirmation)
 * ⚡ "Long work is cancellable" (Integrated AbortController)
 */
export function useAction<T, Args extends any[]>(
    actionFn: (options: { signal?: AbortSignal }, ...args: Args) => Promise<T>,
    options: ActionOptions<T, Args> = {}
) {
    const [state, setState] = useState<ActionState<T>>({
        loading: false,
        error: null,
        data: null,
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    const cancel = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setState(prev => ({ ...prev, loading: false }));
            toast.info('Action cancelled by user.');
        }
    }, []);

    const execute = useCallback(async (...args: Args) => {
        // 1. Confirm if needed
        if (options.confirmMessage) {
            const message = typeof options.confirmMessage === 'function'
                ? options.confirmMessage(...args)
                : options.confirmMessage;

            if (!window.confirm(message)) return null;
        }

        // 2. Setup AbortController if cancellable
        if (options.cancellable) {
            abortControllerRef.current = new AbortController();
        }

        setState({ loading: true, error: null, data: null });

        // Show loading toast if provided
        let toastId: string | number | undefined;
        if (options.loadingMessage) {
            toastId = toast.loading(options.loadingMessage);
        }

        try {
            const result = await actionFn(
                { signal: abortControllerRef.current?.signal },
                ...args
            );

            setState({ loading: false, error: null, data: result });

            // Handle Success
            if (options.successMessage) {
                toast.success(options.successMessage, { id: toastId });
            } else if (toastId) {
                toast.dismiss(toastId);
            }

            options.onSuccess?.(result, ...args);
            return result;

        } catch (err: any) {
            // Don't show error if it was a user-initiated abort
            if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
                return null;
            }

            const apiError = err as ApiError;
            setState({ loading: false, error: apiError, data: null });

            // Platform Principle: "Never fail silently."
            const errorMsg = typeof options.errorMessage === 'function'
                ? options.errorMessage(apiError)
                : (options.errorMessage || apiError.actionable_message || "Action failed.");

            toast.error(errorMsg, {
                id: toastId,
                description: apiError.retryable ? "You can try again." : undefined,
            });

            options.onError?.(apiError);
            return null;
        } finally {
            abortControllerRef.current = null;
        }
    }, [actionFn, options]);

    return {
        ...state,
        execute,
        cancel,
        isCancellable: !!options.cancellable
    };
}
