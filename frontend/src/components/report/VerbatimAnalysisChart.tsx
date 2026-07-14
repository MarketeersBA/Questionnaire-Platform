import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Smile,
    Frown,
    Minus,
    Sparkles,
    Quote,
    Search,
    ChevronRight,
    Target
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface Theme {
    title: string;
    description: string;
    percentage: number;
    quote: string;
}

interface BrandAnalysis {
    sentiment: {
        positive: number;
        negative: number;
        neutral: number;
    };
    themes: Theme[];
    key_takeaway: string;
}

interface VerbatimAnalysisProps {
    data: {
        brands: Record<string, BrandAnalysis>;
        synthesis: string;
    };
}

export const VerbatimAnalysisChart: React.FC<VerbatimAnalysisProps> = ({ data }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const brands = Object.keys(data.brands || {});
    const [activeBrand, setActiveBrand] = useState(brands[0]);

    if (!brands.length) return null;

    const currentAnalysis = data.brands[activeBrand];

    return (
        <div className="flex flex-col h-full space-y-8 animate-fade-in">
            {/* Synthesis Header */}
            {data.synthesis && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-6 rounded-3xl border ${isDark ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'} relative overflow-hidden`}
                >
                    <div className="flex items-start gap-4 relative z-10">
                        <div className="mt-1 p-2 bg-indigo-500 rounded-xl shadow-lg shadow-indigo-500/20">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500 mb-1 block">Neural Synthesis</span>
                            <p className={`text-lg font-bold italic tracking-tight leading-snug ${isDark ? 'text-indigo-200' : 'text-indigo-900'}`}>
                                "{data.synthesis}"
                            </p>
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[50px] -mr-16 -mt-16" />
                </motion.div>
            )}

            <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
                {/* Brand Tabs Sidebar */}
                <div className="lg:w-64 shrink-0 space-y-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-4 block mb-4">Competitor Nodes</span>
                    {brands.map((brand) => (
                        <button
                            key={brand}
                            onClick={() => setActiveBrand(brand)}
                            className={`w-full text-left p-4 rounded-2xl border transition-all relative group overflow-hidden ${activeBrand === brand
                                ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue ring-1 ring-brand-blue/20'
                                : 'bg-transparent border-slate-200 dark:border-white/5 text-slate-500 hover:border-slate-300 dark:hover:border-white/10'
                                }`}
                        >
                            <div className="flex items-center justify-between relative z-10">
                                <span className={`font-black uppercase tracking-tighter text-sm ${activeBrand === brand ? 'italic underline decoration-2 underline-offset-4' : ''}`}>
                                    {brand}
                                </span>
                                {activeBrand === brand && <ChevronRight className="w-4 h-4" />}
                            </div>
                            {activeBrand === brand && (
                                <motion.div
                                    layoutId="activeTabGlow"
                                    className="absolute inset-0 bg-brand-blue/5 blur-xl group-hover:bg-brand-blue/10 transition-all"
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* Analysis Content */}
                <div className="flex-1 min-h-0 flex flex-col space-y-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeBrand}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6 h-full flex flex-col"
                        >
                            {/* Brand Header & Sentiment */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className={`md:col-span-2 p-6 rounded-[32px] border ${isDark ? 'bg-slate-900/50 border-white/5' : 'bg-slate-50 border-slate-200'} flex flex-col justify-center`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Target className="w-4 h-4 text-brand-blue" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Core Takeaway</span>
                                    </div>
                                    <h4 className={`text-2xl font-black italic tracking-tighter uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {currentAnalysis.key_takeaway}
                                    </h4>
                                </div>

                                <div className={`p-6 rounded-[32px] border ${isDark ? 'bg-slate-900/50 border-white/5' : 'bg-slate-50 border-slate-200'} space-y-4`}>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Sentiment Pulse</span>
                                    <div className="flex items-center gap-4">
                                        <SentimentPill icon={<Smile />} color="emerald" value={currentAnalysis.sentiment.positive} isDark={isDark} />
                                        <SentimentPill icon={<Minus />} color="slate" value={currentAnalysis.sentiment.neutral} isDark={isDark} />
                                        <SentimentPill icon={<Frown />} color="red" value={currentAnalysis.sentiment.negative} isDark={isDark} />
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden flex">
                                        <div className="h-full bg-emerald-500" style={{ width: `${currentAnalysis.sentiment.positive}%` }} />
                                        <div className="h-full bg-slate-400" style={{ width: `${currentAnalysis.sentiment.neutral}%` }} />
                                        <div className="h-full bg-red-500" style={{ width: `${currentAnalysis.sentiment.negative}%` }} />
                                    </div>
                                </div>
                            </div>

                            {/* Themes Scroll Area */}
                            <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Qualitative Themes</span>
                                {currentAnalysis.themes.map((theme, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-6 rounded-[32px] border ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200'} hover:border-brand-blue/30 transition-all group`}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-brand-blue/10 flex items-center justify-center border border-brand-blue/20 text-brand-blue font-black shadow-sm group-hover:scale-110 transition-transform">
                                                    {theme.percentage}%
                                                </div>
                                                <div>
                                                    <h5 className={`font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{theme.title}</h5>
                                                    <p className="text-xs text-slate-500 font-medium">{theme.description}</p>
                                                </div>
                                            </div>
                                            <Search className="w-4 h-4 text-slate-500 opacity-20 group-hover:opacity-100 transition-all" />
                                        </div>

                                        <div className={`p-4 rounded-2xl ${isDark ? 'bg-black/20' : 'bg-slate-50'} border border-dashed border-slate-200 dark:border-white/10 relative`}>
                                            <Quote className="w-4 h-4 text-brand-blue/30 absolute -top-2 -left-2" />
                                            <p className={`text-xs italic font-semibold leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                                "{theme.quote}"
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

const SentimentPill = ({ icon, color, value, isDark }: any) => {
    const colors: any = {
        emerald: isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-100',
        slate: isDark ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : 'bg-slate-50 text-slate-600 border-slate-100',
        red: isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-600 border-red-100'
    };
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors[color]} text-[10px] font-black uppercase tracking-wider shadow-sm`}>
            {React.cloneElement(icon, { size: 12 })}
            {value}%
        </div>
    );
};
