import React, { Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { motion } from 'framer-motion';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    errorMessage?: string;
    onRetry?: () => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[AsyncBoundary] Error caught:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
        this.props.onRetry?.();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center p-12 text-center bg-surface rounded-3xl border border-line/80 dark:border-line/10 shadow-xl"
                >
                    <div className="p-4 bg-red-50 dark:bg-red-400/10 rounded-full mb-6">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                    </div>
                    <h3 className="text-lg font-black uppercase tracking-widest text-ink mb-2">
                        Module Failed to Load
                    </h3>
                    <p className="text-ink-subtle text-xs font-bold max-w-xs mb-8 leading-relaxed">
                        {this.props.errorMessage || this.state.error?.message || "An unexpected error occurred while rendering this component."}
                    </p>

                    <button
                        onClick={this.handleRetry}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95 shadow-lg shadow-slate-900/10"
                    >
                        <RefreshCcw className="w-3 h-3" />
                        Retry Component
                    </button>
                </motion.div>
            );
        }

        return this.props.children;
    }
}

interface AsyncBoundaryProps extends ErrorBoundaryProps {
    pendingFallback?: ReactNode;
    /** "Render first" - if enabled, will show skeleton immediately */
    progressive?: boolean;
}

/**
 * Platform Principle: "Render first, refine in the background" + "Never fail silently".
 * Combines React Suspense + ErrorBoundary + Standardized Empty/Error States.
 */
export const AsyncBoundary: React.FC<AsyncBoundaryProps> = ({
    children,
    pendingFallback,
    errorMessage,
    onRetry,
}) => {
    return (
        <ErrorBoundary errorMessage={errorMessage} onRetry={onRetry}>
            <Suspense fallback={pendingFallback || <DefaultSkeleton />}>
                {children}
            </Suspense>
        </ErrorBoundary>
    );
};

const DefaultSkeleton = () => (
    <div className="w-full h-48 bg-surface-raised/50 rounded-3xl animate-pulse flex items-center justify-center">
        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700/50 rounded-full" />
    </div>
);
