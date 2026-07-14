import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    Database,
    AlertTriangle,
    TrendingUp,
    DollarSign,
    Zap,
    CheckCircle2,
    ShieldAlert,
    BarChart3,
    Layers,
    Clock
} from 'lucide-react';
import { analytics } from '../services/api';
import { toast } from 'sonner';

interface AIQuotaStatus {
    summary: {
        total_cost_usd: number;
        total_tokens: number;
        prompt_tokens: number;
        completion_tokens: number;
        cache_entries: number;
    };
    leaderboard: Array<{ _id: string; cost: number }>;
    component_mix: Array<{ _id: string; cost: number; calls: number }>;
    status: string;
}

interface AIAlert {
    _id: string;
    type: string;
    severity: string;
    survey_id: string;
    error_message: string;
    cost_summary: any;
    timestamp: string;
    acknowledged: boolean;
}

const AdminAITelemetry = () => {
    const [status, setStatus] = useState<AIQuotaStatus | null>(null);
    const [alerts, setAlerts] = useState<AIAlert[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [statusRes, alertsRes] = await Promise.all([
                analytics.getAIQuotaStatus(),
                analytics.getAIAlerts()
            ]);
            setStatus(statusRes);
            setAlerts(alertsRes);
        } catch (error) {
            toast.error('Neural Telemetry Sync Failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Polling every 30s
        return () => clearInterval(interval);
    }, []);

    const handleAcknowledge = async (id: string) => {
        try {
            await analytics.acknowledgeAIAlert(id);
            toast.success('Alert Acknowledged & Logged');
            setAlerts(prev => prev.filter(a => a._id !== id));
        } catch (error) {
            toast.error('Failed to acknowledge alert');
        }
    };

    if (loading && !status) {
        return (
            <div className="min-h-screen bg-slate-950 p-12 flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="p-4 bg-brand-blue/10 rounded-full border border-brand-blue/20"
                >
                    <Zap className="w-12 h-12 text-brand-blue" />
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020617] text-white p-8 md:p-12 space-y-12 pb-32">
            {/* Header Area */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-12">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                            <ShieldAlert className="w-6 h-6 text-indigo-400" />
                        </div>
                        <span className="text-indigo-400 font-bold tracking-[0.3em] text-[10px] uppercase">Ecosystem Manager</span>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black italic tracking-tighter uppercase leading-none">
                        AI Neural <span className="text-brand-blue">Telemetry</span>
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">System Health</p>
                        <div className="flex items-center gap-2 justify-end">
                            <span className="text-emerald-400 font-black tracking-widest uppercase text-sm">{status?.status || 'Operational'}</span>
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulseShadow" />
                        </div>
                    </div>
                </div>
            </header>

            {/* Top Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    label="Total Platform Spend"
                    value={`$${status?.summary.total_cost_usd.toFixed(2)}`}
                    icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
                    trend="+12% vs last week"
                />
                <MetricCard
                    label="Neural Tokens"
                    value={status?.summary.total_tokens.toLocaleString() || '0'}
                    icon={<Zap className="w-5 h-5 text-brand-blue" />}
                    trend="Prompt-heavy load"
                />
                <MetricCard
                    label="Cache Efficiency"
                    value={`${status?.summary.cache_entries || 0}`}
                    icon={<Database className="w-5 h-5 text-indigo-400" />}
                    trend="Persistent nodes"
                />
                <MetricCard
                    label="Processing Calls"
                    value={status?.component_mix.reduce((acc, c) => acc + c.calls, 0).toLocaleString() || '0'}
                    icon={<Activity className="w-5 h-5 text-purple-400" />}
                    trend="High concurrency"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Active Alerts Section */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black uppercase tracking-widest italic flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            Critical Exceptions
                        </h2>
                        <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-bold text-amber-500">
                            {alerts.length} PENDING ACTION
                        </span>
                    </div>

                    <div className="space-y-4">
                        <AnimatePresence mode="popLayout">
                            {alerts.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="p-12 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-slate-500"
                                >
                                    <CheckCircle2 className="w-12 h-12 mb-4 opacity-20" />
                                    <p className="font-bold tracking-widest text-xs uppercase">All Neural Thresholds Within Normal Range</p>
                                </motion.div>
                            ) : (
                                alerts.map((alert) => (
                                    <motion.div
                                        key={alert._id}
                                        layout
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="p-6 bg-slate-900/50 border border-white/5 rounded-3xl hover:border-amber-500/30 transition-all group"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-4">
                                                <div className="mt-1 p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h3 className="font-bold text-white uppercase tracking-tight">AI Quota Exhausted</h3>
                                                        <span className="px-2 py-0.5 bg-red-500/20 text-red-500 text-[8px] font-black rounded uppercase">CRITICAL</span>
                                                    </div>
                                                    <p className="text-slate-400 text-sm mb-4 leading-relaxed max-w-lg">
                                                        {alert.error_message}
                                                    </p>
                                                    <div className="flex items-center gap-6">
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase">{new Date(alert.timestamp).toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Survey ID: {alert.survey_id}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleAcknowledge(alert._id)}
                                                className="px-6 py-3 bg-white text-black font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-amber-500 hover:text-white transition-all active:scale-95 shadow-lg shadow-white/5"
                                            >
                                                Acknowledge
                                            </button>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Leaderboard & Component Mix Sidebars */}
                <div className="space-y-8">
                    {/* Leaderboard */}
                    <aside className="p-8 bg-slate-900/50 border border-white/5 rounded-[40px] space-y-6">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] italic flex items-center gap-3">
                            <TrendingUp className="w-4 h-4 text-brand-blue" />
                            Cost Leaderboard
                        </h2>
                        <div className="space-y-4">
                            {status?.leaderboard.map((item, i) => (
                                <div key={item._id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                                    <div className="flex items-center gap-4">
                                        <span className="text-slate-500 font-black font-mono text-xs">0{i + 1}</span>
                                        <div className="w-8 h-8 rounded-full bg-brand-blue/10 flex items-center justify-center border border-brand-blue/20">
                                            <Layers className="w-4 h-4 text-brand-blue" />
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-400 truncate w-24">ID: {item._id}</div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-black text-white">${item.cost.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>

                    {/* Component Mix */}
                    <aside className="p-8 bg-indigo-950/20 border border-indigo-500/10 rounded-[40px] space-y-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[60px] rounded-full -mr-16 -mt-16" />
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] italic flex items-center gap-3">
                            <BarChart3 className="w-4 h-4 text-indigo-400" />
                            Neural Surface Mix
                        </h2>
                        <div className="space-y-6">
                            {status?.component_mix.map((comp) => (
                                <div key={comp._id} className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                                        <span className="text-slate-400">{comp._id.replace('_', ' ')}</span>
                                        <span className="text-indigo-400">${comp.cost.toFixed(2)}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-indigo-950/50 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(comp.cost / status.summary.total_cost_usd) * 100}%` }}
                                            className="h-full bg-indigo-500 rounded-full"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

const MetricCard = ({ label, value, icon, trend }: any) => (
    <div className="p-8 bg-slate-900/40 border border-white/5 rounded-[40px] relative overflow-hidden group hover:border-brand-blue/30 transition-all animate-fade-in">
        <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
                <div className="p-3 bg-white/5 rounded-2xl border border-white/5 group-hover:scale-110 transition-transform">
                    {icon}
                </div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{trend}</div>
            </div>
            <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
                <h3 className="text-3xl font-black italic tracking-tighter text-white">{value}</h3>
            </div>
        </div>
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-brand-blue/5 blur-[40px] rounded-full -mb-12 -mr-12" />
    </div>
);

export default AdminAITelemetry;
