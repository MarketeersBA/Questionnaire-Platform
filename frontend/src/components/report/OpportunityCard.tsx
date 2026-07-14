import { Target, AlertTriangle, ArrowDown, Users, ChevronRight } from 'lucide-react';

interface OpportunityInsight {
    title: string;
    insight: string;
    actions: string[];
    attribute: string;
    gap_score: number;
    confidence: number;
}

export function OpportunityCard({ opportunity }: { opportunity: OpportunityInsight }) {
    const isCritical = Math.abs(opportunity.gap_score) > 2.0;

    return (
        <div className={`relative overflow-hidden group bg-white dark:bg-slate-900 rounded-[32px] border ${isCritical ? 'border-rose-100 dark:border-rose-500/20 shadow-rose-500/5' : 'border-amber-100 dark:border-amber-500/20 shadow-amber-500/5'} border-solid shadow-xl transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl`}>
            {/* Header / Banner */}
            <div className={`h-2 w-full ${isCritical ? 'bg-rose-500' : 'bg-amber-500'}`} />

            <div className="p-8">
                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isCritical ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                        <AlertTriangle size={12} className="shrink-0" />
                        {isCritical ? 'Critical Opportunity' : 'Actionable Opportunity'}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider">
                        <Users size={12} className="shrink-0" />
                        Confidence: {(opportunity.confidence * 100).toFixed(0)}%
                    </div>
                </div>

                {/* Title & Insight */}
                <div className="mb-8">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 leading-tight group-hover:text-brand-blue transition-colors duration-300">
                        {opportunity.title}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg font-medium">
                        {opportunity.insight}
                    </p>
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 gap-4 mb-8 bg-slate-50 dark:bg-white/5 p-6 rounded-2xl border border-slate-100 dark:border-white/10">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Performance Gap</span>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-2xl font-black ${isCritical ? 'text-rose-500' : 'text-amber-500'}`}>
                                {opportunity.gap_score.toFixed(1)}
                            </span>
                            <ArrowDown size={14} className={isCritical ? 'text-rose-500' : 'text-amber-500'} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Focus Attribute</span>
                        <span className="text-lg font-bold text-slate-700 dark:text-slate-200 truncate block">
                            {opportunity.attribute}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Target size={18} className="text-brand-blue" />
                        <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Recommended Actions</span>
                    </div>
                    <div className="space-y-3">
                        {opportunity.actions.map((action, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-white/5 shadow-sm group/action transition-all hover:border-brand-blue/30 hover:bg-slate-50 dark:hover:bg-slate-800/80">
                                <div className="mt-1 shrink-0 w-5 h-5 rounded-full bg-brand-blue/10 flex items-center justify-center">
                                    <ChevronRight size={14} className="text-brand-blue" />
                                </div>
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-snug">
                                    {action}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Micro-animation elements */}
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-brand-blue/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            <div className="absolute -top-4 -left-4 w-16 h-16 bg-amber-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
        </div>
    );
}
