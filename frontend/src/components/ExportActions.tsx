import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText, Table, ChevronDown, Monitor, XCircle, Loader2 } from 'lucide-react';
import { useAction } from '../hooks/useAction';
import { analytics } from '../services/api';

interface ExportOption {
    id: 'csv' | 'txt' | 'json' | 'pptx';
    label: string;
    icon: React.ElementType;
    description: string;
}

interface ExportActionsProps {
    surveyId?: string;
    onExport: (format: 'csv' | 'txt' | 'json' | 'pptx') => void;
    isLoading?: boolean;
    label?: string;
    variant?: 'primary' | 'secondary';
    showPptx?: boolean;
}

export const ExportActions: React.FC<ExportActionsProps> = ({
    surveyId,
    onExport,
    isLoading = false,
    label = "Export Registry",
    variant = 'primary',
    showPptx = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Advanced Action for PPTX specifically if enabled
    const pptxAction = useAction(
        async ({ signal }) => {
            if (!surveyId) return;
            return await analytics.generatePptx(surveyId, {}, { signal });
        },
        {
            loadingMessage: 'Initializing high-fidelity PPTX export...',
            successMessage: 'PPTX Engine started. Progress will be tracked in the report.',
            errorMessage: (err) => `Export failed: ${err.actionable_message}`,
            cancellable: true
        }
    );

    const options: ExportOption[] = [
        ...(showPptx ? [{
            id: 'pptx' as const,
            label: 'Executive PPTX (16:9)',
            icon: Monitor,
            description: 'AI-generated presentation deck'
        }] : []),
        {
            id: 'csv',
            label: 'Comma Separated (CSV)',
            icon: Table,
            description: 'Best for Excel or Google Sheets'
        },
        {
            id: 'txt',
            label: 'Plain Text (TXT)',
            icon: FileText,
            description: 'Simple list of URLs, one per line'
        }
    ];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const buttonStyles = variant === 'primary'
        ? "bg-primary text-white shadow-lg shadow-primary/20 hover:shadow-primary/40"
        : "bg-surface text-ink-muted border border-line/80 dark:border-line/10 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm";

    const isProcessing = isLoading || pptxAction.loading;

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isProcessing}
                className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-black uppercase tracking-[0.15em] text-[10px] transition-all duration-300 active:scale-95 ${buttonStyles}`}
            >
                {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Download className="w-4 h-4" />
                )}
                {pptxAction.loading ? "Generating..." : label}
                <ChevronDown className={`w-4 h-4 transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="absolute right-0 mt-4 w-72 bg-surface border border-line/80 dark:border-line/10 rounded-3xl shadow-2xl z-[100] overflow-hidden backdrop-blur-xl"
                    >
                        <div className="p-3 space-y-1">
                            <div className="px-4 py-2 mb-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle font-display">Select Strategy Output</p>
                            </div>
                            {options.map((option) => (
                                <button
                                    key={option.id}
                                    onClick={async () => {
                                        if (option.id === 'pptx') {
                                            await pptxAction.execute();
                                        } else {
                                            onExport(option.id);
                                        }
                                        setIsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-primary/5 dark:hover:bg-primary/10 transition-all text-left group"
                                >
                                    <div className="p-2.5 rounded-xl bg-surface-raised text-slate-400 group-hover:text-primary-soft group-hover:bg-primary/10 transition-colors border border-transparent group-hover:border-primary/10">
                                        <option.icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black text-ink uppercase tracking-wider">{option.label}</p>
                                        <p className="text-[9px] font-bold text-ink-subtle mt-0.5">{option.description}</p>
                                    </div>
                                </button>
                            ))}

                            {/* Cancellable Job Status */}
                            {pptxAction.loading && (
                                <div className="p-4 mt-2 bg-surface-raised/50 rounded-2xl border border-line/80 dark:border-line/10">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-primary-soft animate-pulse">Processing...</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                pptxAction.cancel();
                                            }}
                                            className="text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 flex items-center gap-1"
                                        >
                                            <XCircle size={12} />
                                            Abort
                                        </button>
                                    </div>
                                    <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ x: '-100%' }}
                                            animate={{ x: '100%' }}
                                            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                                            className="w-1/2 h-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-surface-raised/50 p-4 border-t border-line/80 dark:border-line/10">
                            <p className="text-[9px] font-bold text-slate-400 leading-relaxed italic">
                                Note: High-fidelity exports may take up to 2 minutes to certify.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

