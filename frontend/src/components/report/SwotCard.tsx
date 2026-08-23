import { Shield, ShieldAlert, Zap, Target } from 'lucide-react';

interface SwotData {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
}

export function SwotCard({ brand, swot }: { brand: string, swot: SwotData }) {
    return (
        <div className="bg-surface rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="bg-slate-900 dark:bg-slate-950 p-4 text-center">
                <h3 className="text-xl font-bold text-white">{brand} SWOT Analysis</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200 dark:bg-slate-700">
                {/* Strengths */}
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

                {/* Weaknesses */}
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

                {/* Opportunities */}
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

                {/* Threats */}
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
