import { X, Cpu, Activity, BarChart4, Info, Download, Zap, TrendingUp } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';

export interface CostData {
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_cost_usd: number;
    by_component: Record<string, {
        prompt_tokens: number;
        completion_tokens: number;
        cost_usd: number;
        calls: number;
    }>;
}

interface AICostDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    costData: CostData | null;
}

export function AICostDashboard({ isOpen, onClose, costData }: AICostDashboardProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    if (!isOpen) return null;

    const handleExport = () => {
        if (!costData) return;
        const blob = new Blob([JSON.stringify(costData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai_telemetry_${new Date().getTime()}.json`;
        a.click();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        className={`
                            relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[32px] 
                            flex flex-col border shadow-2xl backdrop-blur-2xl
                            ${isDark
                                ? 'bg-[#0F111A]/95 border-slate-700/50 shadow-indigo-950/20'
                                : 'bg-white/95 border-slate-200/50 shadow-slate-200/50'
                            }
                        `}
                    >
                        {/* Header Section */}
                        <div className={`p-8 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'} flex justify-between items-center bg-gradient-to-r ${isDark ? 'from-indigo-500/5 to-transparent' : 'from-indigo-50/50 to-transparent'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-2xl ${isDark ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-600 shadow-sm'}`}>
                                    <Activity className="w-6 h-6" />
                                </div>
                                <div className="space-y-0.5">
                                    <h2 className="text-2xl font-black uppercase tracking-tighter italic">Neural Cost Command</h2>
                                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 ${isDark ? 'text-indigo-300' : 'text-slate-500'}`}>
                                        Computational Telemetry & Financial Mapping
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleExport}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all
                                        ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}
                                    `}
                                >
                                    <Download size={14} />
                                    Export JSON
                                </button>
                                <button
                                    onClick={onClose}
                                    className={`p-2 rounded-full transition-all ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Body Section */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            {!costData ? (
                                <div className="flex flex-col items-center justify-center py-32 opacity-30 select-none">
                                    <Zap className="w-16 h-16 mb-6 animate-pulse" />
                                    <p className="text-xl font-bold uppercase tracking-widest italic">Matrix Offline</p>
                                    <p className="text-sm mt-2 font-mono">Telemetry link not established for this report.</p>
                                </div>
                            ) : (
                                <div className="space-y-10">
                                    {/* Topline Dashboard */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        <MetricCard
                                            icon={<div className="text-indigo-500"><TrendingUp size={16} /></div>}
                                            label="Investment"
                                            value={`$${costData.total_cost_usd.toFixed(4)}`}
                                            subtext="Total Financial Overlay"
                                            highlight
                                            isDark={isDark}
                                        />
                                        <MetricCard
                                            icon={<Cpu size={16} />}
                                            label="Total Tokens"
                                            value={costData.total_tokens.toLocaleString()}
                                            subtext={`${((costData.total_completion_tokens / costData.total_tokens) * 100).toFixed(0)}% Output Ratio`}
                                            isDark={isDark}
                                        />
                                        <MetricCard
                                            icon={<Zap size={16} />}
                                            label="Prompt Load"
                                            value={costData.total_prompt_tokens.toLocaleString()}
                                            subtext="Context Overhead"
                                            isDark={isDark}
                                        />
                                        <MetricCard
                                            icon={<BarChart4 size={16} />}
                                            label="Total Calls"
                                            value={Object.values(costData.by_component).reduce((a, b) => a + b.calls, 0).toLocaleString()}
                                            subtext="AI Synthesis Cycles"
                                            isDark={isDark}
                                        />
                                    </div>

                                    {/* Visual distribution chart */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-4">
                                            <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-40">Cost Distribution</h3>
                                            <div className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800 opacity-50" />
                                        </div>
                                        <div className="flex w-full h-12 rounded-2xl overflow-hidden border border-line/80 dark:border-line/10 shadow-inner">
                                            {Object.entries(costData.by_component).map(([comp, metrics], idx) => {
                                                const share = (metrics.cost_usd / costData.total_cost_usd) * 100;
                                                const colors = ['bg-indigo-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500'];
                                                return (
                                                    <motion.div
                                                        key={comp}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${share}%` }}
                                                        className={`${colors[idx % colors.length]} relative group`}
                                                        title={`${comp.replace(/_/g, ' ')}: ${share.toFixed(1)}%`}
                                                    >
                                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-white transition-opacity" />
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-6">
                                            {Object.entries(costData.by_component).map(([comp, metrics], idx) => {
                                                const colors = ['bg-indigo-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500'];
                                                return (
                                                    <div key={comp} className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                                                            {comp.replace(/_/g, ' ')} ({((metrics.cost_usd / costData.total_cost_usd) * 100).toFixed(0)}%)
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Table breakdown */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-6">
                                            <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-40">Component Metrics</h3>
                                            <div className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800 opacity-50" />
                                        </div>
                                        <div className={`rounded-3xl border overflow-hidden ${isDark ? 'border-slate-800 bg-slate-800/20' : 'border-slate-100 bg-slate-50/50'}`}>
                                            <table className="w-full text-sm text-left border-collapse">
                                                <thead>
                                                    <tr className={`${isDark ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                                                        <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px]">Matrix Component</th>
                                                        <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-right">Cycles</th>
                                                        <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-right">Total Tokens</th>
                                                        <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-right">Avg / Call</th>
                                                        <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-right">Cost Overlay</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                                                    {Object.entries(costData.by_component).map(([component, metrics]) => (
                                                        <tr key={component} className={`transition-all ${isDark ? 'hover:bg-indigo-500/5' : 'hover:bg-indigo-50/50'}`}>
                                                            <td className="px-6 py-5">
                                                                <div className="flex flex-col">
                                                                    <span className="font-sans font-black uppercase tracking-tight text-indigo-500">
                                                                        {component.replace(/_/g, ' ')}
                                                                    </span>
                                                                    <span className="text-[10px] italic opacity-40">OpenAI Neural Processor</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5 text-right font-bold">{metrics.calls}</td>
                                                            <td className="px-6 py-5 text-right">
                                                                <div className="flex flex-col items-end">
                                                                    <span>{(metrics.prompt_tokens + metrics.completion_tokens).toLocaleString()}</span>
                                                                    <span className="text-[9px] opacity-40">P: {metrics.prompt_tokens.toLocaleString()} | C: {metrics.completion_tokens.toLocaleString()}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5 text-right opacity-60">
                                                                {Math.round((metrics.prompt_tokens + metrics.completion_tokens) / metrics.calls).toLocaleString()}
                                                            </td>
                                                            <td className="px-6 py-5 text-right font-black text-emerald-500">
                                                                ${metrics.cost_usd.toFixed(4)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Footer Info */}
                                    <div className={`p-4 rounded-2xl flex items-start gap-3 border ${isDark ? 'bg-indigo-500/5 border-indigo-500/10' : 'bg-indigo-50/30 border-indigo-100'}`}>
                                        <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                                        <p className="text-[11px] leading-relaxed opacity-60">
                                            Cost estimates are calculated using real-time OpenAI pricing models for input (prompt) and output (completion) tokens.
                                            Actual billing may vary slightly due to rounding and dynamic provider-side adjustments.
                                            Contact the system administrator for monthly quota snapshots.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

function MetricCard({ icon, label, value, subtext, highlight = false, isDark }: { icon: any, label: string, value: string, subtext?: string, highlight?: boolean, isDark: boolean }) {
    return (
        <div className={`
            p-6 rounded-[24px] border transition-all relative overflow-hidden group
            ${highlight
                ? (isDark ? 'bg-indigo-500/10 border-indigo-500/30 shadow-indigo-900/10 hover:border-indigo-500/50' : 'bg-indigo-50 border-indigo-200 shadow-indigo-100/30 hover:border-indigo-300')
                : (isDark ? 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600' : 'bg-white border-slate-100 shadow-sm hover:shadow-md')
            }
        `}>
            <div className={`mb-3 opacity-60 flex items-center justify-between`}>
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
                <div className={`${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{icon}</div>
            </div>
            <div className={`text-4xl font-black italic tracking-tighter font-mono ${highlight ? (isDark ? 'text-indigo-400' : 'text-indigo-700') : (isDark ? 'text-white' : 'text-slate-900')}`}>
                {value}
            </div>
            {subtext && <div className="mt-2 text-[10px] font-bold opacity-40 uppercase tracking-widest leading-tight">{subtext}</div>}

            {/* Subtle interactive background element */}
            <div className={`absolute -right-4 -bottom-4 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-10 dark:group-hover:opacity-20 transition-opacity duration-700 ${isDark ? 'bg-indigo-500' : 'bg-indigo-300'}`} />
        </div>
    );
}
