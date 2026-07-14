import { Users, Target, Activity, Search, TrendingUp, Star } from 'lucide-react';
import {
    filterWebScorecardProfile,
    formatScorecardProfileValue,
    hasVisibleScorecardContent,
    isNpsProfileKey,
} from '../../utils/scorecardProfile';

export function ScorecardGrid({ data }: { data: any }) {
    const profile = data?.profile || {};
    const strengths = data?.strengths || [];
    const profileEntries = filterWebScorecardProfile(profile);
    const showEmptyState = !hasVisibleScorecardContent(profile, strengths);

    const getIcon = (key: string) => {
        if (isNpsProfileKey(key)) {
            return <TrendingUp className="h-5 w-5 text-rose-400" />;
        }

        const k = key.toLowerCase();
        if (k.includes('sample') || k.includes('n=')) return <Users className="h-5 w-5 text-brand-blue" />;
        if (k.includes('brand')) return <Target className="h-5 w-5 text-brand-accent" />;
        if (k.includes('t2b') || k.includes('score') || k.includes('%')) {
            return <Activity className="h-5 w-5 text-emerald-400" />;
        }
        return <Search className="h-5 w-5 text-slate-400" />;
    };

    return (
        <div className="space-y-8">
            {profileEntries.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {profileEntries.map(([key, value]) => (
                        <div key={key} className="glass-panel p-8 rounded-[32px] border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 transition-all group relative overflow-hidden bg-white dark:bg-transparent">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all scale-150">
                                {getIcon(key)}
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10">
                                        {getIcon(key)}
                                    </div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                        {key.replace(/_/g, ' ')}
                                    </p>
                                </div>
                                <h4 className="text-4xl font-black text-slate-900 dark:text-white capitalize tracking-tight italic">
                                    {formatScorecardProfileValue(key, value)}
                                </h4>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {strengths.length > 0 && (
                <div className="space-y-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 flex items-center gap-2">
                        <Star className="h-3 w-3" />
                        Top Strengths
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {strengths.map((s: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-5 bg-white/[0.02] rounded-2xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                                        <TrendingUp className="h-4 w-4 text-brand-blue" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{s.attribute}</span>
                                </div>
                                <span className="text-lg font-black text-slate-800 dark:text-white font-mono">{s.score}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showEmptyState && (
                <div className="py-12 text-center text-slate-500 italic font-medium uppercase tracking-widest bg-white/5 rounded-3xl border border-dashed border-white/10">
                    No Analytical Telemetry Available
                </div>
            )}
        </div>
    );
}
