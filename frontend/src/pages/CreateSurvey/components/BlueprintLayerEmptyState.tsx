import { motion } from 'framer-motion';
import { Layers, Loader2 } from 'lucide-react';
import { LayerEmptyDiagnostic } from '../../../utils/architectStepDiagnostics';

interface BlueprintLayerEmptyStateProps {
    diagnostic: LayerEmptyDiagnostic;
    onRefresh?: () => void | Promise<void>;
    isRefreshing?: boolean;
}

export function BlueprintLayerEmptyState({
    diagnostic,
    onRefresh,
    isRefreshing = false,
}: BlueprintLayerEmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-32 flex flex-col items-center justify-center text-center space-y-6 bg-slate-50/50 dark:bg-slate-950/20 rounded-[4rem] border-2 border-dashed border-line/80 dark:border-line/10"
        >
            <div className="relative">
                <div className="absolute inset-0 bg-slate-200 blur-2xl rounded-full opacity-30" />
                <div className="relative w-20 h-20 rounded-[2rem] bg-surface flex items-center justify-center text-slate-400 shadow-sm">
                    <Layers className="w-10 h-10" />
                </div>
            </div>
            <div className="max-w-md">
                <h4 className="text-xl font-display font-black text-ink uppercase tracking-tight">
                    {diagnostic.title}
                </h4>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-relaxed mt-2">
                    {diagnostic.message}
                </p>
                {diagnostic.statsLine && (
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-4 px-4 py-2 rounded-full bg-slate-100/80 dark:bg-slate-900/60 inline-block">
                        {diagnostic.statsLine}
                    </p>
                )}
                {onRefresh && (
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className="mt-8 px-8 py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center gap-2"
                    >
                        {isRefreshing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Refreshing…
                            </>
                        ) : (
                            'Refresh Blueprint'
                        )}
                    </button>
                )}
            </div>
        </motion.div>
    );
}
