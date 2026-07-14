import { StrategicCommandSection } from './StrategicCommandSection';

interface Finding {
    label: string;
    finding: string;
    impact: 'positive' | 'negative' | 'neutral';
}

interface OpportunityAction {
    action: string;
    category: string;
    index: number;
}

interface OpportunityInsight {
    title: string;
    insight: string;
    strategic_category: string;
    impact: string;
    effort: string;
    priority_level: number;
    actions: OpportunityAction[];
    score: number;
    gap_magnitude: number;
    confidence: number;
    attribute: string;
}

export function ExecutiveSummary({
    summary,
    findings,
    opportunity_insights,
    surveyId,
    editable = false,
}: {
    summary?: string,
    findings?: Finding[],
    opportunity_insights?: OpportunityInsight[],
    surveyId?: string,
    editable?: boolean,
}) {
    return (
        <div className="space-y-12">
            {summary && (
                <div className="bg-white dark:bg-slate-900 p-10 rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] dark:shadow-2xl border border-indigo-100/50 dark:border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600" />
                    <div className="relative z-10">
                        <h2 className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.4em] mb-4">Strategic Narrative</h2>
                        <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-8 tracking-tight">Key Finding</h3>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-xl font-medium max-w-4xl">
                            {summary}
                        </p>
                    </div>
                    {/* Background decorative elements */}
                    <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl" />
                </div>
            )}

            {findings && findings.length > 0 && (
                <div className="space-y-8">
                    <div className="flex items-center gap-4 px-2">
                        <div className="h-0.5 w-12 bg-slate-300 dark:bg-slate-700" />
                        <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.4em]">Observations</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {findings.map((f, i) => (
                            <div key={i} className="bg-white dark:bg-slate-900/50 p-8 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-[0_10px_40px_-5px_rgba(0,0,0,0.02)] transition-all hover:shadow-2xl hover:-translate-y-1 group">
                                <div className="flex justify-between items-start mb-6">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Finding #{String(i + 1).padStart(2, '0')}</span>
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${f.impact === 'positive' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                        f.impact === 'negative' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                                        }`}>
                                        {f.impact}
                                    </span>
                                </div>
                                <h4 className="text-xl font-black text-slate-800 dark:text-white mb-4 leading-tight group-hover:text-brand-blue transition-colors">{f.label}</h4>
                                <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{f.finding}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {opportunity_insights && opportunity_insights.length > 0 && (
                <StrategicCommandSection insights={opportunity_insights} surveyId={surveyId} editable={editable} />
            )}
        </div>
    );
}
