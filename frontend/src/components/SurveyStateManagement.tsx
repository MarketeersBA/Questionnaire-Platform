import { useState } from 'react';
import { CheckCircle2, ChevronDown, AlertCircle, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface StateToggleProps {
    currentStatus: string;
    onTransition: (newStatus: string) => Promise<void>;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
    draft: { label: 'Draft', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800/50' },
    active: { label: 'Active', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800/50' },
    closed: { label: 'Closed', dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/50', border: 'border-slate-200 dark:border-slate-700/50' },
};

const TRANSITIONS: Record<string, string[]> = {
    draft: ['active', 'closed'],
    active: ['closed'],
    closed: [],
};

export function SurveyStateToggle({ currentStatus, onTransition }: StateToggleProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isConfirming, setIsConfirming] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const cfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.draft;
    const available = TRANSITIONS[currentStatus] || [];

    const executeTransition = async () => {
        if (!isConfirming) return;
        setLoading(true);
        try {
            await onTransition(isConfirming);
            setIsConfirming(null);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative inline-block">
            {/* Status badge / trigger */}
            <button
                onClick={() => available.length > 0 && setIsOpen(!isOpen)}
                disabled={available.length === 0}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black border transition-all ${cfg.bg} ${cfg.text} ${cfg.border} ${available.length > 0 ? 'hover:shadow-sm cursor-pointer' : 'cursor-default opacity-70'
                    }`}
            >
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${currentStatus === 'active' ? 'animate-pulse' : ''}`}></span>
                <span className="uppercase tracking-widest">{cfg.label}</span>
                {available.length > 0 && (
                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown size={11} />
                    </motion.div>
                )}
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 mt-2 w-44 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xl z-40 overflow-hidden"
                        >
                            <div className="p-1.5 space-y-0.5">
                                {available.map(status => {
                                    const s = STATUS_CONFIG[status];
                                    return (
                                        <button
                                            key={status}
                                            onClick={() => { setIsOpen(false); setIsConfirming(status); }}
                                            className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-black transition-all hover:${s.bg} ${s.text} group`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${s.dot}`}></span>
                                            Move to {s.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Confirmation Modal — light theme */}
            <AnimatePresence>
                {isConfirming && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/20 backdrop-blur-sm"
                        onClick={(e) => e.target === e.currentTarget && setIsConfirming(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.92, y: 16 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.92, y: 16 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                            className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 max-w-sm w-full border border-slate-100 dark:border-slate-800 shadow-2xl relative"
                        >
                            {/* Close button */}
                            <button
                                onClick={() => setIsConfirming(null)}
                                className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center"
                            >
                                <X size={14} />
                            </button>

                            {/* Icon */}
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6 ${isConfirming === 'active' ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50'
                                }`}>
                                {isConfirming === 'active'
                                    ? <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                                    : <AlertCircle className="w-7 h-7 text-amber-500" />
                                }
                            </div>

                            <h3 className="text-xl font-black text-slate-900 dark:text-white text-center mb-2">
                                {isConfirming === 'active' ? 'Activate Campaign?' : 'Close Campaign?'}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center font-medium leading-relaxed mb-2">
                                Moving from <span className="font-black text-slate-700 dark:text-slate-300 uppercase text-xs">{currentStatus}</span> → <span className="font-black text-slate-700 dark:text-slate-300 uppercase text-xs">{isConfirming}</span>
                            </p>
                            {isConfirming === 'active' && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mb-6">
                                    The Google Form ID will be locked once activated.
                                </p>
                            )}
                            {isConfirming === 'closed' && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mb-6">
                                    This action cannot be undone. Existing links remain valid.
                                </p>
                            )}

                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <button
                                    onClick={() => setIsConfirming(null)}
                                    disabled={loading}
                                    className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeTransition}
                                    disabled={loading}
                                    className={`px-4 py-3 rounded-xl text-white font-black text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${isConfirming === 'active'
                                        ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
                                        : 'bg-slate-900 dark:bg-brand-blue dark:hover:bg-brand-blueHover hover:bg-slate-700 shadow-lg shadow-slate-900/10 dark:shadow-brand-blue/20'
                                        }`}
                                >
                                    {loading
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : isConfirming === 'active' ? 'Activate' : 'Close Campaign'
                                    }
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
