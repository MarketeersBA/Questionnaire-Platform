import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, User, Sparkles } from 'lucide-react';

interface MobilePreviewProps {
    formData: any;
    activeLayer: number;
}

export default function MobilePreview({ formData, activeLayer }: MobilePreviewProps) {

    const activeStructure = activeLayer === 1
        ? formData.schema.layer1_structure
        : activeLayer === 2
            ? formData.schema.layer2_structure
            : activeLayer === 3
                ? formData.schema.layer3_structure
                : formData.schema?.layer4_structure || { sections: [] };

    const sections = activeStructure?.sections || [];

    return (
        <div className="w-full max-w-[320px] mx-auto xl:ml-auto">
            <div className="relative aspect-[9/19] bg-slate-900 rounded-[3rem] p-3 shadow-2xl border-[6px] border-slate-800 overflow-hidden group">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-slate-800 rounded-b-3xl z-50 flex items-center justify-center gap-1.5 px-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                    <div className="w-10 h-1 rounded-full bg-slate-700/50" />
                </div>

                {/* Screen Content */}
                <div className="w-full h-full bg-slate-50 dark:bg-slate-950 rounded-[2.2rem] overflow-hidden flex flex-col relative">
                    {/* Status Bar */}
                    <div className="h-10 px-6 flex items-center justify-between opacity-40">
                        <span className="text-[10px] font-black">9:41</span>
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full border border-current opacity-50" />
                            <div className="w-4 h-2 rounded-[2px] bg-current opacity-50" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-10">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`${activeLayer}-${sections.length}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="p-5 space-y-6"
                            >
                                {/* Header Simulation */}
                                <div className="space-y-2 mb-8 text-left">
                                    <div className="flex items-center gap-2">
                                        <div className="px-2 py-0.5 rounded bg-brand-blue/10 text-brand-blue text-[8px] font-black uppercase tracking-widest">
                                            Layer {activeLayer}
                                        </div>
                                        {activeLayer === 4 && <Sparkles className="w-2.5 h-2.5 text-brand-blue" />}
                                    </div>
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                                        {formData.survey_name || 'Project Blueprint'}
                                    </h4>
                                    {/* Progress Bar Mockup */}
                                    <div className="h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: activeLayer === 4 ? '100%' : '40%' }}
                                            className="h-full bg-brand-blue"
                                        />
                                    </div>
                                </div>

                                {/* Simulated Content */}
                                {sections.length > 0 ? (
                                    sections.map((section: any, idx: number) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="space-y-4"
                                        >
                                            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">
                                                    {section.title}
                                                </span>
                                                {activeLayer === 2 && <ShieldCheck className="w-3 h-3 text-emerald-500" />}
                                            </div>

                                            {section.isInstruction ? (
                                                <div className="p-4 bg-brand-blue/5 rounded-2xl border border-brand-blue/10 text-left">
                                                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 leading-relaxed italic">
                                                        {section.content?.length > 100 ? section.content.slice(0, 100) + '...' : section.content}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {(section.questions || []).slice(0, 3).map((q: any, qIdx: number) => (
                                                        <div key={q.id || qIdx} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-2 text-left">
                                                            <p className="text-[10px] font-bold text-slate-900 dark:text-white leading-tight">
                                                                {(q.text || q.label || '').length > 60 ? (q.text || q.label || '').slice(0, 60) + '...' : (q.text || q.label || '')}
                                                            </p>
                                                            {/* Input Mockups */}
                                                            {q.type === 'mcq' || q.type === 'scale' ? (
                                                                <div className="flex gap-1.5 flex-wrap">
                                                                    {[1, 2, 3].map(opt => (
                                                                        <div key={opt} className="h-4 w-12 rounded bg-slate-100 dark:bg-slate-800/50" />
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="h-3 w-full rounded bg-slate-50 dark:bg-slate-800/30" />
                                                            )}
                                                        </div>
                                                    ))}
                                                    {(section.questions || []).length > 3 && (
                                                        <p className="text-center text-[8px] font-black text-slate-400 uppercase tracking-widest pt-2">
                                                            + {(section.questions || []).length - 3} more questions
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                                        <div className="p-4 rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                            <User className="w-10 h-10" />
                                        </div>
                                        <span className="text-[8px] font-black uppercase tracking-[0.2em]">Syncing Neural Blueprint...</span>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Nav Mockup */}
                    <div className="h-16 px-8 border-t border-slate-100 dark:border-slate-900 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md flex items-center justify-center">
                        <div className="w-full h-10 bg-brand-blue rounded-xl flex items-center justify-center">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">{activeLayer === 4 ? 'Complete Survey' : 'Next Phase'}</span>
                        </div>
                    </div>
                </div>

                {/* Home Indicator */}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-slate-700/30 rounded-full" />
            </div>

            {/* Mockup Caption */}
            <div className="mt-6 flex flex-col items-center">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[8px] font-black uppercase tracking-widest">Live Preview Node</span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold mt-2 text-center max-w-[200px]">
                    Simulating real-time respondent behavior and visual flow.
                </p>
            </div>
        </div>
    );
}
