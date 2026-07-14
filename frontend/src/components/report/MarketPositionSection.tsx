import React from 'react';
import {
    Target,
    Shield,
    Users,
    Award,
    Zap,
    TrendingUp,
    Box,
    CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChartRenderer } from './ChartRenderer';

export interface AudienceSegment {
    segment_name: string;
    rationale: string;
    affinity_score: number;
}

export interface MarketPositionResult {
    market_position: 'Leader' | 'Challenger' | 'Niche' | 'Follower';
    position_confidence: 'High' | 'Medium' | 'Low';
    target_audience_profile: string;
    audience_segments: AudienceSegment[];
    competitive_stance: string;
    strategic_implications: string[];
}

interface MarketPositionSectionProps {
    data: MarketPositionResult;
    strategicCharts?: any[];
}

export function MarketPositionSection({ data, strategicCharts = [] }: MarketPositionSectionProps) {
    if (!data) return null;

    // Use a simpler mapping for labels in the tab bar
    const chartLabels: Record<string, string> = {
        'market_position_sigma': 'Radar',
        'audience_affinity': 'Affinity',
        'positioning_matrix': 'Matrix'
    };

    const [activeChartId, setActiveChartId] = React.useState(strategicCharts[0]?.chart_id || '');

    const getArchetypeConfig = (position: string) => {
        switch (position) {
            case 'Leader':
                return {
                    color: 'text-amber-500',
                    bg: 'bg-amber-500/10',
                    border: 'border-amber-500/20',
                    icon: <Award className="w-8 h-8" />,
                    description: 'Dominant market presence with high product quality and usage velocity.'
                };
            case 'Challenger':
                return {
                    color: 'text-rose-500',
                    bg: 'bg-rose-500/10',
                    border: 'border-rose-500/20',
                    icon: <TrendingUp className="w-8 h-8" />,
                    description: 'High performance coupled with aggressive growth potential vs market leader.'
                };
            case 'Niche':
                return {
                    color: 'text-emerald-500',
                    bg: 'bg-emerald-500/10',
                    border: 'border-emerald-500/20',
                    icon: <Target className="w-8 h-8" />,
                    description: 'Strong performance within specialized audience segments but lower overall mass-market scale.'
                };
            default:
                return {
                    color: 'text-slate-500',
                    bg: 'bg-slate-500/10',
                    border: 'border-slate-500/20',
                    icon: <Box className="w-8 h-8" />,
                    description: 'Steady market presence with average performance across key category drivers.'
                };
        }
    };

    const config = getArchetypeConfig(data.market_position);

    return (
        <div id="strategic-positioning" className="space-y-10 py-4">
            {/* Section Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-xl">
                        <Shield className="text-indigo-500 w-5 h-5" />
                    </div>
                    <h2 className="text-xs font-black text-indigo-500 uppercase tracking-[0.5em]">
                        Executive Intelligence
                    </h2>
                </div>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                    Strategic Command Center
                </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* 1. Main Position Card (Archetype) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="lg:col-span-12 xl:col-span-12 2xl:col-span-5 relative group"
                >
                    <div className={`
                        relative overflow-hidden rounded-[40px] p-10 border shadow-2xl h-full
                        glass-panel backdrop-blur-xl transition-all duration-500
                        ${config.border} bg-white/40 dark:bg-slate-900/40
                    `}>
                        <div className="absolute top-0 right-0 p-8 opacity-10 scale-150 rotate-12">
                            {config.icon}
                        </div>

                        <div className="space-y-8 relative">
                            <div className="space-y-3">
                                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${config.bg} ${config.color}`}>
                                    Archetype Classification
                                </div>
                                <h4 className={`text-6xl font-black italic tracking-tighter ${config.color}`}>
                                    {data.market_position}
                                </h4>
                                <p className="text-slate-600 dark:text-slate-400 font-medium text-lg leading-relaxed max-w-sm">
                                    {config.description}
                                </p>
                            </div>

                            <div className="pt-8 border-t border-slate-200 dark:border-white/5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Zap className="w-4 h-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Prediction Confidence</span>
                                    </div>
                                    <span className={`text-xs font-black uppercase ${data.position_confidence === 'High' ? 'text-emerald-500' :
                                        data.position_confidence === 'Medium' ? 'text-amber-500' : 'text-rose-500'
                                        }`}>
                                        {data.position_confidence} Stability
                                    </span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: data.position_confidence === 'High' ? '95%' : data.position_confidence === 'Medium' ? '65%' : '35%' }}
                                        className={`h-full rounded-full transition-all duration-1000 ${data.position_confidence === 'High' ? 'bg-emerald-500' :
                                            data.position_confidence === 'Medium' ? 'bg-amber-500' : 'bg-rose-500'
                                            }`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* 2. Target Audience Identity */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-12 xl:col-span-12 2xl:col-span-7 space-y-6"
                >
                    <div className="glass-panel rounded-[40px] p-8 border border-slate-100 dark:border-white/5 shadow-xl bg-white/20 dark:bg-slate-900/20 h-full">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-500">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <h5 className="text-xl font-black text-slate-900 dark:text-white leading-none">Core Audience Identity</h5>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Primary Demographic & Geographic Profile</span>
                            </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-indigo-500/5 border border-indigo-500/10 mb-8">
                            <p className="text-xl font-bold text-slate-800 dark:text-slate-200 leading-snug italic">
                                "{data.target_audience_profile}"
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-4">
                                <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Top Affinity Hubs</h6>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-2 gap-4">
                                {data.audience_segments.map((segment, idx) => (
                                    <div key={idx} className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-tight">
                                                {segment.segment_name}
                                            </span>
                                            <div className="flex items-center gap-1 text-emerald-500">
                                                <TrendingUp size={12} />
                                                <span className="text-[10px] font-black">{segment.affinity_score.toFixed(0)} AAI</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed line-clamp-2">
                                            {segment.rationale}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* 3. Deep Analysis & Strategic Intent */}
                <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Competitive Stance */}
                    <div className="glass-panel rounded-[40px] p-8 border border-slate-100 dark:border-white/5 shadow-xl bg-gradient-to-br from-white/40 to-indigo-500/5 dark:from-slate-900/40 dark:to-indigo-500/5">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-rose-500/10 rounded-2xl text-rose-500 font-black italic text-sm">
                                vs
                            </div>
                            <div>
                                <h5 className="text-xl font-black text-slate-900 dark:text-white leading-none">Competitive Stance</h5>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Relative Market positioning</span>
                            </div>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 font-medium text-sm leading-relaxed">
                            {data.competitive_stance}
                        </p>
                    </div>

                    {/* Strategic Implications */}
                    <div className="glass-panel rounded-[40px] p-8 border border-slate-100 dark:border-white/5 shadow-xl bg-gradient-to-br from-white/40 to-emerald-500/5 dark:from-slate-900/40 dark:to-emerald-500/5">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                                <Zap className="w-6 h-6" />
                            </div>
                            <div>
                                <h5 className="text-xl font-black text-slate-900 dark:text-white leading-none">Positioning Imperatives</h5>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">3 Actionable positioning insights</span>
                            </div>
                        </div>
                        <ul className="space-y-3">
                            {data.strategic_implications.map((imp, idx) => (
                                <li key={idx} className="flex items-start gap-3 group/item">
                                    <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-snug group-hover/item:text-emerald-500 transition-colors">
                                        {imp}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* 4. Strategic Charts Injection Layer */}
                {strategicCharts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="lg:col-span-12 space-y-12 mt-12 bg-slate-50 dark:bg-white/[0.01] p-10 rounded-[60px] border border-slate-200 dark:border-white/5 shadow-inner"
                    >
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                            <div className="space-y-2">
                                <div className="text-[10px] font-black text-brand-blue uppercase tracking-[0.4em]">Visual Evidence Network</div>
                                <h4 className="text-3xl font-black text-slate-900 dark:text-white italic tracking-tighter uppercase">Positioning Visualizations</h4>
                            </div>

                            <div className="flex gap-2 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm">
                                {strategicCharts.map((chart) => (
                                    <button
                                        key={chart.chart_id}
                                        onClick={() => setActiveChartId(chart.chart_id)}
                                        className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeChartId === chart.chart_id
                                            ? 'bg-brand-blue text-white shadow-xl scale-105'
                                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5'
                                            }`}
                                    >
                                        {chartLabels[chart.chart_id] || chart.title.split(' ').pop()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeChartId || 'empty'}
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ duration: 0.5 }}
                                className="min-h-[500px]"
                            >
                                {(() => {
                                    const activeChart = strategicCharts.find(c => c.chart_id === activeChartId);
                                    if (!activeChart) return null;
                                    return (
                                        <ChartRenderer
                                            chart={activeChart}
                                            isFocusMode={false}
                                        />
                                    );
                                })()}
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
