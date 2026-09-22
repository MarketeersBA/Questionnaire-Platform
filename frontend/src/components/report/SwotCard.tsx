import { Shield, ShieldAlert, Zap, Target, EyeOff } from 'lucide-react';
import { useReport } from '../../context/ReportContext';

interface SwotData {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
}

export function SwotCard({ brand, swot }: { brand: string, swot: SwotData }) {
    const { isItemHidden, hideItem } = useReport();
    const hideId = `swot:${brand}`;
    if (isItemHidden(hideId)) return null;

    return (
        <div className="bg-surface rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="bg-slate-900 dark:bg-slate-950 p-4 flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-white truncate">{brand} SWOT Analysis</h3>
                <button
                    type="button"
                    onClick={() => hideItem(hideId, `${brand} SWOT`, 'card')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/20 bg-white/10 text-white hover:bg-white/15 transition-all shrink-0"
                    title="Hide SWOT card"
                    aria-label="Hide SWOT card"
                >
                    <EyeOff className="w-3.5 h-3.5" />
                    Hide
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200 dark:bg-slate-700">
                <div className="bg-surface p-6">
                    <div className="flex items-center gap-2 mb-4 text-emerald-600 dark:text-emerald-400">
                        <Shield className="h-5 w-5" />
                        <span className="font-bold uppercase tracking-tight">Strengths</span>
                    </div>
                    <ul className="space-y-2">
                        {swot.strengths.map((s, i) => (
                            <li key={i} className="text-sm text-ink-muted flex items-start gap-2">
                                <span className="text-emerald-500 mt-1">•</span> {s}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-surface p-6">
                    <div className="flex items-center gap-2 mb-4 text-red-600 dark:text-red-400">
                        <ShieldAlert className="h-5 w-5" />
                        <span className="font-bold uppercase tracking-tight">Weaknesses</span>
                    </div>
                    <ul className="space-y-2">
                        {swot.weaknesses.map((w, i) => (
                            <li key={i} className="text-sm text-ink-muted flex items-start gap-2">
                                <span className="text-red-500 mt-1">•</span> {w}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-surface p-6">
                    <div className="flex items-center gap-2 mb-4 text-blue-600 dark:text-blue-400">
                        <Zap className="h-5 w-5" />
                        <span className="font-bold uppercase tracking-tight">Opportunities</span>
                    </div>
                    <ul className="space-y-2">
                        {swot.opportunities.map((o, i) => (
                            <li key={i} className="text-sm text-ink-muted flex items-start gap-2">
                                <span className="text-blue-500 mt-1">•</span> {o}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-surface p-6">
                    <div className="flex items-center gap-2 mb-4 text-amber-600 dark:text-amber-400">
                        <Target className="h-5 w-5" />
                        <span className="font-bold uppercase tracking-tight">Threats</span>
                    </div>
                    <ul className="space-y-2">
                        {swot.threats.map((t, i) => (
                            <li key={i} className="text-sm text-ink-muted flex items-start gap-2">
                                <span className="text-amber-500 mt-1">•</span> {t}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
