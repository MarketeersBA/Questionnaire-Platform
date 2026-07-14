import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';

interface TooltipProps {
    id: string;
    title: string;
    description: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    children: React.ReactNode;
}

export default function OnboardingTooltip({ id, title, description, position = 'bottom', children }: TooltipProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const dismissed = localStorage.getItem(`tooltip_dismissed_${id}`);
        if (!dismissed) {
            const timer = setTimeout(() => setVisible(true), 1500); // 1.5s delay so it appears clearly after load
            return () => clearTimeout(timer);
        }
    }, [id]);

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        setVisible(false);
        localStorage.setItem(`tooltip_dismissed_${id}`, 'true');
    };

    const posClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-4',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-4',
        left: 'right-full top-1/2 -translate-y-1/2 mr-4',
        right: 'left-full top-1/2 -translate-y-1/2 ml-4'
    };

    return (
        <div className="relative inline-block w-full">
            {children}
            <AnimatePresence>
                {visible && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: position === 'top' ? 10 : position === 'bottom' ? -10 : 0, x: position === 'left' ? 10 : position === 'right' ? -10 : 0 }}
                        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={`absolute z-[100] w-80 ${posClasses[position]}`}
                    >
                        <div className="bg-slate-900 dark:bg-slate-950 border border-slate-700/50 dark:border-slate-800 text-white p-5 rounded-3xl shadow-2xl relative overflow-hidden group transition-colors">
                            <div className="absolute inset-0 bg-brand-blue/10 dark:bg-brand-blue/5 blur-xl opacity-50 pointer-events-none" />

                            <button
                                onClick={handleDismiss}
                                className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 dark:hover:bg-white/5 transition-colors z-10"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            <div className="flex items-start gap-4 relative z-10">
                                <div className="p-2.5 bg-brand-blue/20 dark:bg-brand-blue/10 text-brand-blue rounded-xl shrink-0 mt-0.5 border border-brand-blue/20 dark:border-brand-blue/30 transition-colors">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div className="pr-6">
                                    <h4 className="font-black font-display text-base mb-1.5 text-white">{title}</h4>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed font-medium transition-colors">{description}</p>
                                </div>
                            </div>

                            <div className="mt-5 flex justify-end relative z-10">
                                <button onClick={handleDismiss} className="px-4 py-2 rounded-xl bg-brand-blue/20 dark:bg-brand-blue/10 text-brand-blue text-[10px] font-black uppercase tracking-widest hover:bg-brand-blue hover:text-white transition-all border border-brand-blue/20 dark:border-brand-blue/30">
                                    Got it
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
