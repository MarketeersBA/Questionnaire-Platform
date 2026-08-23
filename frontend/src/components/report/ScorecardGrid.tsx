import { Users, Target, Activity, Search, TrendingUp, Star } from 'lucide-react';
import {
    filterWebScorecardProfile,
    formatScorecardProfileValue,
    hasVisibleScorecardContent,
    isNpsProfileKey,
} from '../../utils/scorecardProfile';
import { formatBrandName } from '../../utils/brandName';

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
        if (k.includes('sample') || k.includes('n=')) return <Users className="h-5 w-5 text-primary-soft" />;
        if (k.includes('brand')) return <Target className="h-5 w-5 text-brand-accent" />;
        if (k.includes('t2b') || k.includes('score') || k.includes('%')) {
            return <Activity className="h-5 w-5 text-emerald-400" />;
        }
        return <Search className="h-5 w-5 text-slate-400" />;
    };

    return (
        <div className="space-y-6">
            {profileEntries.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {profileEntries.map(([key, value]) => (
                        <div key={key} className="card-brand p-5 rounded-2xl transition-all hover:-translate-y-0.5 hover:border-primary/40 group relative overflow-hidden">
                            {/* Soft brand bloom behind the metric */}
                            <div
                                className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-60 group-hover:opacity-90 transition-opacity"
                                style={{ background: 'radial-gradient(circle, rgba(231,157,158,0.45) 0%, transparent 72%)' }}
                            />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2.5 mb-3">
                                    <div className="p-1.5 bg-primary/10 rounded-lg">
                                        {getIcon(key)}
                                    </div>
                                    <p className="text-[10px] font-black text-ink-subtle uppercase tracking-[0.18em] leading-tight">
                                        {key.replace(/_/g, ' ')}
                                    </p>
                                </div>
                                {/* Shape markers such as (مثلث) are stripped: the
                                    legend already carries them. */}
                                <h4 className="text-2xl font-black text-ink tracking-tight leading-tight break-words">
                                    {formatBrandName(formatScorecardProfileValue(key, value))}
                                </h4>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {strengths.length > 0 && (
                <div className="space-y-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-ink-subtle flex items-center gap-2">
                        <Star className="h-3 w-3 text-accent-soft" />
                        Top Strengths
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {strengths.map((s: any, i: number) => (
                            <div
                                key={i}
                                className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface-raised/60 border border-primary/15 dark:border-line/10 hover:border-primary/40 transition-colors"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <TrendingUp className="h-4 w-4 text-primary-soft" />
                                    </div>
                                    <span className="text-[14px] font-bold text-ink truncate">{s.attribute}</span>
                                </div>
                                <span className="text-lg font-black text-primary-soft font-mono tabular-nums shrink-0">{s.score}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showEmptyState && (
                <div className="py-10 text-center text-ink-subtle font-bold uppercase tracking-widest text-xs bg-surface-sunken rounded-2xl border border-dashed border-primary/20 dark:border-line/10">
                    No Analytical Telemetry Available
                </div>
            )}
        </div>
    );
}
