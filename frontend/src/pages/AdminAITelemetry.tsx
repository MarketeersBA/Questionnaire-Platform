import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
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
    Clock,
    Sparkles,
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

/** Blue → red ramp for the component mix bars. */
const MIX_COLORS = ['#255E91', '#2E7BB8', '#21A0FF', '#E79D9E', '#CD393B'];

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
            setAlerts(Array.isArray(alertsRes) ? alertsRes : []);
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

    const summary = status?.summary;
    const componentMix = status?.component_mix ?? [];
    const leaderboard = status?.leaderboard ?? [];

    /** Totals derived from the payload — no invented figures. */
    const derived = useMemo(() => {
        const totalCalls = componentMix.reduce((acc, c) => acc + (c.calls || 0), 0);
        const totalTokens = summary?.total_tokens ?? 0;
        const promptShare = totalTokens > 0
            ? Math.round(((summary?.prompt_tokens ?? 0) / totalTokens) * 100)
            : 0;
        const costPerCall = totalCalls > 0
            ? (summary?.total_cost_usd ?? 0) / totalCalls
            : 0;
        return { totalCalls, promptShare, costPerCall };
    }, [summary, componentMix]);

    const mixChart = useMemo(
        () => componentMix
            .filter((c) => c.cost > 0 || c.calls > 0)
            .map((c) => ({
                name: String(c._id || 'unknown').replace(/_/g, ' '),
                cost: Number(c.cost.toFixed(4)),
                calls: c.calls,
            })),
        [componentMix],
    );

    /** Nothing has been recorded yet — distinct from a failed load. */
    const hasUsage = (summary?.cache_entries ?? 0) > 0 || (summary?.total_cost_usd ?? 0) > 0;

    if (loading && !status) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="p-4 bg-primary/10 rounded-full border border-primary/20"
                    >
                        <Zap className="w-10 h-10 text-primary-soft" />
                    </motion.div>
                    <p className="text-ink-subtle font-bold animate-pulse">Synchronizing AI Telemetry...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-soft">
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                        <span className="text-primary-soft font-black tracking-[0.25em] text-[10px] uppercase">
                            Ecosystem Manager
                        </span>
                    </div>
                    <h1 className="text-4xl font-display font-black text-ink tracking-tight">
                        AI <span className="text-primary-soft">Telemetry</span>
                    </h1>
                    <p className="text-ink-muted font-medium mt-1">
                        Model spend, token load and quota exceptions across the platform
                    </p>
                </div>

                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl card-brand">
                    <span className={`w-2 h-2 rounded-full ${hasUsage ? 'bg-primary animate-pulse' : 'bg-ink-subtle'}`} />
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle leading-none mb-1">
                            System Health
                        </p>
                        <p className="text-xs font-black text-ink uppercase tracking-widest leading-none">
                            {status?.status || 'Unknown'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Metrics — every sub-line is computed from the payload */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <MetricCard
                    icon={DollarSign}
                    label="Total Platform Spend"
                    value={`$${(summary?.total_cost_usd ?? 0).toFixed(2)}`}
                    sub={derived.totalCalls > 0 ? `$${derived.costPerCall.toFixed(4)} per call` : 'No calls recorded'}
                    tone="red"
                />
                <MetricCard
                    icon={Zap}
                    label="Neural Tokens"
                    value={(summary?.total_tokens ?? 0).toLocaleString()}
                    sub={(summary?.total_tokens ?? 0) > 0 ? `${derived.promptShare}% prompt / ${100 - derived.promptShare}% completion` : 'No tokens consumed'}
                    tone="blue"
                />
                <MetricCard
                    icon={Database}
                    label="Cached Responses"
                    value={(summary?.cache_entries ?? 0).toLocaleString()}
                    sub="Reused instead of re-billed"
                    tone="sky"
                />
                <MetricCard
                    icon={Activity}
                    label="Processing Calls"
                    value={derived.totalCalls.toLocaleString()}
                    sub={`Across ${componentMix.length} component${componentMix.length === 1 ? '' : 's'}`}
                    tone="coral"
                />
            </div>

            {!hasUsage ? (
                /* Zero-usage is a real state, not a broken page — say so plainly. */
                <div className="card-brand rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 grid place-items-center mb-5">
                        <Sparkles className="w-8 h-8 text-primary-soft" />
                    </div>
                    <h2 className="text-xl font-display font-black text-ink mb-2">No AI usage recorded yet</h2>
                    <p className="text-ink-muted text-sm font-medium max-w-md">
                        Spend, token and component figures populate as soon as a report runs with AI
                        insights enabled. Nothing has been billed against this platform so far.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* Component mix */}
                    <div className="card-brand lg:col-span-2 rounded-[2rem] p-7">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary-soft">
                                <BarChart3 size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-ink leading-tight">Spend by Component</h2>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle">
                                    Where the AI budget goes
                                </p>
                            </div>
                        </div>

                        {mixChart.length === 0 ? (
                            <p className="text-xs font-bold text-ink-subtle py-12 text-center">
                                No component-level usage recorded yet.
                            </p>
                        ) : (
                            <div style={{ height: Math.max(180, mixChart.length * 46) }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={mixChart} layout="vertical" margin={{ left: 8, right: 24 }}>
                                        <CartesianGrid
                                            strokeDasharray="4 4"
                                            horizontal={false}
                                            stroke="currentColor"
                                            className="text-primary/15 dark:text-slate-800"
                                        />
                                        <XAxis type="number" hide />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={140}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 800 }}
                                        />
                                        <Tooltip
                                            cursor={false}
                                            content={({ active, payload }: any) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="card-brand px-4 py-3 rounded-xl">
                                                        <p className="text-[10px] font-black text-ink-subtle uppercase tracking-widest mb-1">
                                                            {d.name}
                                                        </p>
                                                        <p className="text-sm font-black text-ink">
                                                            ${d.cost.toFixed(4)}
                                                            <span className="text-ink-subtle font-bold ml-2">
                                                                {d.calls} call{d.calls === 1 ? '' : 's'}
                                                            </span>
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="cost" radius={[0, 8, 8, 0]} barSize={16}>
                                            {mixChart.map((_, i) => (
                                                <Cell key={i} fill={MIX_COLORS[i % MIX_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Cost leaderboard */}
                    <div className="card-brand rounded-[2rem] p-7">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent-soft">
                                <TrendingUp size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-ink leading-tight">Cost Leaderboard</h2>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle">
                                    Most expensive surveys
                                </p>
                            </div>
                        </div>

                        {leaderboard.length === 0 ? (
                            <p className="text-xs font-bold text-ink-subtle py-10 text-center">
                                No per-survey spend recorded yet.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {leaderboard.map((item, i) => (
                                    <div
                                        key={item._id}
                                        className="flex items-center gap-3 p-3 rounded-xl border border-primary/15 dark:border-line/10 bg-surface-raised/60 hover:bg-primary/[0.06] transition-colors"
                                    >
                                        <span className="text-ink-subtle font-black font-mono text-[11px] w-5 shrink-0">
                                            {String(i + 1).padStart(2, '0')}
                                        </span>
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <Layers className="w-4 h-4 text-primary-soft" />
                                        </div>
                                        <span className="text-[11px] font-bold text-ink-muted truncate flex-1 min-w-0 font-mono">
                                            {item._id || 'unattributed'}
                                        </span>
                                        <span className="text-sm font-black text-ink tabular-nums shrink-0">
                                            ${item.cost.toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Exceptions */}
            <div className="card-brand rounded-[2rem] p-7">
                <div className="flex items-center justify-between mb-5 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent-soft shrink-0">
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-ink leading-tight">Critical Exceptions</h2>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle">
                                Quota and rate-limit alerts
                            </p>
                        </div>
                    </div>
                    <span className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${alerts.length > 0
                        ? 'bg-accent/10 border-accent/25 text-accent-soft'
                        : 'bg-surface-sunken border-primary/15 dark:border-line/10 text-ink-subtle'
                        }`}>
                        {alerts.length} pending
                    </span>
                </div>

                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {alerts.length === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="py-12 border border-dashed border-primary/20 dark:border-line/10 rounded-2xl flex flex-col items-center justify-center text-ink-subtle"
                            >
                                <CheckCircle2 className="w-10 h-10 mb-3 opacity-30" />
                                <p className="font-black tracking-widest text-[11px] uppercase">
                                    All quota thresholds within range
                                </p>
                            </motion.div>
                        ) : (
                            alerts.map((alert) => (
                                <motion.div
                                    key={alert._id}
                                    layout
                                    initial={{ opacity: 0, x: -16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    className="p-5 rounded-2xl border border-primary/15 dark:border-line/10 bg-surface-raised/60 hover:border-accent/35 transition-colors"
                                >
                                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                        <div className="flex gap-4 min-w-0">
                                            <div className="mt-0.5 p-2 bg-accent/10 rounded-xl border border-accent/20 shrink-0">
                                                <AlertTriangle className="w-4 h-4 text-accent-soft" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                                                    <h3 className="font-black text-ink text-sm uppercase tracking-tight">
                                                        {String(alert.type || 'AI quota alert').replace(/_/g, ' ')}
                                                    </h3>
                                                    <span className="px-2 py-0.5 bg-accent/15 text-accent-soft text-[8px] font-black rounded uppercase tracking-widest">
                                                        {alert.severity || 'critical'}
                                                    </span>
                                                </div>
                                                <p className="text-ink-muted text-sm mb-3 leading-relaxed max-w-2xl break-words">
                                                    {alert.error_message}
                                                </p>
                                                <div className="flex items-center gap-5 flex-wrap">
                                                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-ink-subtle uppercase tracking-wider">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        {new Date(alert.timestamp).toLocaleString()}
                                                    </span>
                                                    {alert.survey_id && (
                                                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-ink-subtle uppercase tracking-wider font-mono">
                                                            <BarChart3 className="w-3.5 h-3.5" />
                                                            {alert.survey_id}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleAcknowledge(alert._id)}
                                            className="btn-primary shrink-0 self-start"
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
        </div>
    );
};

const TONES: Record<string, string> = {
    blue: 'bg-primary/10 text-primary-soft',
    sky: 'bg-[#21A0FF]/12 text-[#21A0FF]',
    red: 'bg-accent/10 text-accent-soft',
    coral: 'bg-[#E79D9E]/25 text-accent-soft',
};

const MetricCard = ({ icon: Icon, label, value, sub, tone = 'blue' }: any) => (
    <div className="card-brand rounded-[1.75rem] p-6 relative overflow-hidden group transition-all hover:-translate-y-0.5 hover:border-accent/40">
        {/* Same red-bloom graphic treatment as the other admin cards */}
        <div
            className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full blur-2xl opacity-70 group-hover:opacity-100 transition-opacity duration-500"
            style={{
                background:
                    'radial-gradient(circle, rgba(231,157,158,0.55) 0%, rgba(205,57,59,0.20) 55%, transparent 78%)',
            }}
        />
        <Icon
            className="pointer-events-none absolute -top-1 -right-1 w-20 h-20 rotate-12 text-accent/20 group-hover:text-accent/30 transition-colors duration-500"
            style={{ filter: 'drop-shadow(0 8px 18px rgba(205,57,59,0.35))' }}
            strokeWidth={1.5}
        />

        <div className={`relative w-12 h-12 ${TONES[tone] || TONES.blue} rounded-2xl flex items-center justify-center mb-4`}>
            <Icon size={24} />
        </div>
        <p className="relative text-xs font-black uppercase tracking-widest text-ink-subtle mb-1">{label}</p>
        <p className="relative text-2xl font-black text-ink">{value}</p>
        {sub && (
            <p className="relative text-[10px] font-bold text-ink-subtle mt-1.5">{sub}</p>
        )}
    </div>
);

export default AdminAITelemetry;
