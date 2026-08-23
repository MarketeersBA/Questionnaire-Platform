import { useEffect, useMemo, useState } from 'react';
import { analytics } from '../services/api';
import { motion } from 'framer-motion';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    RadialBarChart, RadialBar, PolarAngleAxis,
    AreaChart, Area,
} from 'recharts';
import {
    Activity,
    Users,
    ClipboardList,
    Shield,
    HeartPulse,
    Database,
    Clock,
    UserCircle,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    Zap,
    CheckCircle2,
    Gauge,
    TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface PlatformStats {
    users: {
        admins: number;
        analysts: number;
        clients: number;
        total: number;
    };
    platform: {
        surveys: number;
        responses: number;
        active_surveys: number;
    };
    recent_audit: Array<{
        _id: string;
        action: string;
        username: string;
        resource_type: string;
        timestamp: string;
    }>;
    system: {
        uptime: string;
        status: string;
    };
}

/** Roles in hierarchy order, with their brand colours. */
const ROLE_META = [
    { key: 'admins', label: 'Account Admins', color: '#255E91' },
    { key: 'analysts', label: 'Market Analysts', color: '#21A0FF' },
    { key: 'clients', label: 'Partner Clients', color: '#CD393B' },
] as const;

/* Card accents — the logo's blue and red plus their tints. No third hue. */
const TONES: Record<string, string> = {
    blue: 'bg-primary/10 text-primary-soft',
    sky: 'bg-[#21A0FF]/12 text-[#21A0FF]',
    cyan: 'bg-[#8ACAEC]/25 text-[#2E7BB8] dark:text-[#8ACAEC]',
    red: 'bg-accent/10 text-accent-soft',
    coral: 'bg-[#E79D9E]/25 text-accent-soft',
};

/** Audit rows per page — sized so the panel never needs its own scrollbar. */
const AUDIT_PAGE_SIZE = 6;

export default function PlatformAnalytics() {
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [auditPage, setAuditPage] = useState(0);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const data = await analytics.getPlatformStats();
            setStats(data);
        } catch (err) {
            toast.error('Failed to load platform analytics');
        } finally {
            setLoading(false);
        }
    };

    const roleBreakdown = useMemo(
        () =>
            ROLE_META
                .map((r) => ({ ...r, value: stats?.users?.[r.key] ?? 0 }))
                .filter((r) => r.value > 0),
        [stats],
    );

    /** Recent audit volume grouped by action, describing the log beside it. */
    const actionBreakdown = useMemo(() => {
        const counts = new Map<string, number>();
        (stats?.recent_audit || []).forEach((log) => {
            const key = String(log.action || 'unknown').replace(/_/g, ' ');
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return Array.from(counts.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [stats]);

    /** Share of the survey portfolio currently live. */
    const activation = useMemo(() => {
        const total = stats?.platform?.surveys ?? 0;
        const active = stats?.platform?.active_surveys ?? 0;
        return {
            total,
            active,
            pct: total > 0 ? Math.round((active / total) * 100) : 0,
        };
    }, [stats]);

    /** Average responses collected per survey across the platform. */
    const density = useMemo(() => {
        const total = stats?.platform?.surveys ?? 0;
        const responses = stats?.platform?.responses ?? 0;
        return {
            responses,
            perSurvey: total > 0 ? Math.round((responses / total) * 10) / 10 : 0,
        };
    }, [stats]);

    /**
     * Audit events bucketed by hour of day. Uses only timestamps already in the
     * payload, so it reflects the same window the log below shows.
     */
    const auditVelocity = useMemo(() => {
        const buckets = new Map<string, number>();
        (stats?.recent_audit || []).forEach((log) => {
            const d = new Date(log.timestamp);
            if (Number.isNaN(d.getTime())) return;
            const key = `${String(d.getHours()).padStart(2, '0')}:00`;
            buckets.set(key, (buckets.get(key) || 0) + 1);
        });
        return Array.from(buckets.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, value]) => ({ name, value }));
    }, [stats]);

    const auditLogs = stats?.recent_audit || [];
    const pageCount = Math.max(1, Math.ceil(auditLogs.length / AUDIT_PAGE_SIZE));
    const safePage = Math.min(auditPage, pageCount - 1);
    const pagedLogs = auditLogs.slice(
        safePage * AUDIT_PAGE_SIZE,
        safePage * AUDIT_PAGE_SIZE + AUDIT_PAGE_SIZE,
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-ink-subtle font-bold animate-pulse">Synchronizing Platform Data...</p>
                </div>
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-display font-black text-ink tracking-tight transition-colors">
                    Platform <span className="text-primary-soft">Intelligence</span>
                </h1>
                <p className="text-ink-muted font-medium mt-1 transition-colors">
                    Global ecosystem health and usage telemetry
                </p>
            </div>

            {/* System + volume cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <StatCard icon={HeartPulse} label="System Status" value={stats.system.status} tone="blue" />
                <StatCard icon={Activity} label="Platform Uptime" value={stats.system.uptime} tone="sky" />
                <StatCard icon={Users} label="Global Identities" value={stats.users.total} tone="cyan" />
                <StatCard icon={ClipboardList} label="Survey Volume" value={stats.platform.surveys} tone="red" />
                <StatCard icon={Zap} label="Active Surveys" value={stats.platform.active_surveys} tone="coral" />
                <StatCard
                    icon={CheckCircle2}
                    label="Total Responses"
                    value={Number(stats.platform.responses || 0).toLocaleString()}
                    tone="red"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* ── User hierarchy ──
                    Three progress bars left most of this column empty, so the
                    same data now leads with a donut and keeps the bars as the
                    precise read underneath. */}
                <div className="lg:col-span-1 space-y-6">
                <div className="card-brand rounded-[2rem] p-7">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary-soft">
                            <Shield size={20} />
                        </div>
                        <h2 className="text-lg font-black text-ink">User Hierarchy</h2>
                    </div>

                    {roleBreakdown.length === 0 ? (
                        <p className="text-xs font-bold text-ink-subtle py-8 text-center">
                            No identities registered yet.
                        </p>
                    ) : (
                        <>
                            <div className="h-[190px] relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={roleBreakdown}
                                            dataKey="value"
                                            nameKey="label"
                                            innerRadius="62%"
                                            outerRadius="92%"
                                            paddingAngle={roleBreakdown.length > 1 ? 3 : 0}
                                            strokeWidth={0}
                                        >
                                            {roleBreakdown.map((r) => (
                                                <Cell key={r.key} fill={r.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip cursor={false} content={<MiniTooltip unit="User" />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                                    <div className="text-center">
                                        <p className="text-3xl font-display font-black text-ink leading-none">
                                            {stats.users.total}
                                        </p>
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle mt-1">
                                            Identities
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 space-y-5">
                                {ROLE_META.map((r) => (
                                    <RoleRow
                                        key={r.key}
                                        label={r.label}
                                        count={stats.users[r.key]}
                                        total={stats.users.total}
                                        color={r.color}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                    {/* Activation gauge */}
                    <div className="card-brand rounded-[2rem] p-7 relative overflow-hidden group">
                        <CardGraphic icon={Gauge} />
                        <div className="relative flex items-center gap-3 mb-2">
                            <div className={`w-10 h-10 rounded-xl ${TONES.blue} flex items-center justify-center`}>
                                <Gauge size={20} />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-ink leading-tight">Activation</h2>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle">
                                    Live share of portfolio
                                </p>
                            </div>
                        </div>

                        <div className="relative h-[150px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    data={[{ name: 'Active', value: activation.pct }]}
                                    innerRadius="70%"
                                    outerRadius="100%"
                                    startAngle={90}
                                    endAngle={-270}
                                >
                                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                    <RadialBar
                                        dataKey="value"
                                        cornerRadius={12}
                                        background={{ fill: 'rgba(37,94,145,0.10)' }}
                                        fill="url(#activationGrad)"
                                    />
                                    <defs>
                                        <linearGradient id="activationGrad" x1="0" y1="0" x2="1" y2="1">
                                            <stop offset="0%" stopColor="#21A0FF" />
                                            <stop offset="100%" stopColor="#CD393B" />
                                        </linearGradient>
                                    </defs>
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 grid place-items-center pointer-events-none">
                                <div className="text-center">
                                    <p className="text-3xl font-display font-black text-ink leading-none">
                                        {activation.pct}%
                                    </p>
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle mt-1">
                                        {activation.active} of {activation.total}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Audit trail ── */}
                <div className="card-brand lg:col-span-2 rounded-[2rem] p-7 flex flex-col">
                    <div className="flex items-center justify-between mb-5 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary-soft shrink-0">
                                <Database size={20} />
                            </div>
                            <h2 className="text-lg font-black text-ink truncate">Recent Audit Logs</h2>
                        </div>
                        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary-soft bg-primary/5 border border-primary/15 px-3 py-1.5 rounded-xl shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            Live Stream
                        </span>
                    </div>

                    {/* Activity mix — describes the log listed below it */}
                    {actionBreakdown.length > 1 && (
                        <div className="mb-5 pb-5 border-b border-primary/15 dark:border-line/10">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle mb-3">
                                Activity mix
                            </p>
                            <div className="h-[104px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={actionBreakdown} layout="vertical" margin={{ left: 4, right: 12 }}>
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
                                            width={110}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 800 }}
                                        />
                                        <Tooltip cursor={false} content={<MiniTooltip unit="Event" />} />
                                        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={12} fill="url(#auditBar)" />
                                        <defs>
                                            <linearGradient id="auditBar" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="#21A0FF" />
                                                <stop offset="100%" stopColor="#255E91" />
                                            </linearGradient>
                                        </defs>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Column header, so the rows below read as a table */}
                    {pagedLogs.length > 0 && (
                        <div className="hidden md:grid grid-cols-[2.25rem_1fr_8rem_6rem_1.25rem] items-center gap-3 px-3 pb-2 mb-1 border-b border-primary/15 dark:border-line/10">
                            <span />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle">Actor &amp; action</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle">Resource</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle text-right">Time</span>
                            <span />
                        </div>
                    )}

                    {/* Paged rows — arrows instead of a long scrolling column */}
                    <div className="space-y-1 flex-1">
                        {pagedLogs.length === 0 ? (
                            <p className="text-xs font-bold text-ink-subtle py-10 text-center">
                                No audit activity recorded yet.
                            </p>
                        ) : (
                            pagedLogs.map((log) => (
                                <motion.div
                                    key={log._id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="grid items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:border-primary/25 hover:bg-primary/[0.05] transition-colors group grid-cols-[2.25rem_1fr_auto] md:grid-cols-[2.25rem_1fr_8rem_6rem_1.25rem]"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-surface-raised flex items-center justify-center text-ink-subtle group-hover:text-primary-soft group-hover:bg-primary/10 transition-all">
                                        <UserCircle size={17} />
                                    </div>

                                    <p className="text-sm font-black text-ink truncate min-w-0">
                                        {log.username}
                                        <span className="text-ink-subtle font-bold mx-1.5">performed</span>
                                        <span className="text-primary-soft">{log.action.replace(/_/g, ' ')}</span>
                                    </p>

                                    <span className="hidden md:inline-flex items-center justify-center px-2 py-1 rounded-lg bg-surface-sunken border border-primary/15 dark:border-line/10 text-[9px] font-black uppercase tracking-widest text-ink-subtle truncate">
                                        {log.resource_type}
                                    </span>

                                    <span className="flex items-center justify-end gap-1 text-ink-subtle font-bold text-[10px] tabular-nums whitespace-nowrap">
                                        <Clock size={10} className="shrink-0" />
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>

                                    <ArrowUpRight
                                        size={16}
                                        className="hidden md:block text-primary/25 group-hover:text-primary-soft transition-colors"
                                    />
                                </motion.div>
                            ))
                        )}
                    </div>

                    {auditLogs.length > AUDIT_PAGE_SIZE && (
                        <div className="flex items-center justify-between pt-4 mt-4 border-t border-primary/15 dark:border-line/10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-ink-subtle">
                                {safePage * AUDIT_PAGE_SIZE + 1}–
                                {Math.min((safePage + 1) * AUDIT_PAGE_SIZE, auditLogs.length)} of {auditLogs.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <PagerButton
                                    label="Previous page"
                                    disabled={safePage === 0}
                                    onClick={() => setAuditPage((p) => Math.max(0, p - 1))}
                                >
                                    <ChevronLeft size={16} />
                                </PagerButton>
                                <span className="text-[11px] font-black text-ink tabular-nums px-1">
                                    {safePage + 1}<span className="text-ink-subtle"> / {pageCount}</span>
                                </span>
                                <PagerButton
                                    label="Next page"
                                    disabled={safePage >= pageCount - 1}
                                    onClick={() => setAuditPage((p) => Math.min(pageCount - 1, p + 1))}
                                >
                                    <ChevronRight size={16} />
                                </PagerButton>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Throughput row ──
                The page previously ended at the two panels above, leaving the
                lower third of the viewport blank. These three read off numbers
                already in the payload: activation share, response density, and
                the hourly shape of the same audit window listed above. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Response density */}
                <div className="card-brand rounded-[2rem] p-7 relative overflow-hidden group flex flex-col">
                    <CardGraphic icon={TrendingUp} />
                    <div className="relative flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-xl ${TONES.red} flex items-center justify-center`}>
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-ink leading-tight">Response Density</h2>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle">
                                Average per survey
                            </p>
                        </div>
                    </div>

                    <div className="relative flex-1 flex flex-col justify-center">
                        <p className="text-5xl font-display font-black text-ink leading-none">
                            {density.perSurvey}
                        </p>
                        <p className="text-[11px] font-bold text-ink-muted mt-2">
                            responses per survey, across {activation.total.toLocaleString()} surveys
                        </p>
                        <div className="mt-5 space-y-2.5">
                            <MiniStat label="Total responses" value={density.responses.toLocaleString()} color="#255E91" />
                            <MiniStat label="Live surveys" value={activation.active} color="#CD393B" />
                        </div>
                    </div>
                </div>

                {/* Hourly audit velocity */}
                <div className="card-brand rounded-[2rem] p-7 relative overflow-hidden group flex flex-col">
                    <CardGraphic icon={Activity} />
                    <div className="relative flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-xl ${TONES.sky} flex items-center justify-center`}>
                            <Activity size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-ink leading-tight">Audit Velocity</h2>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-subtle">
                                Events by hour
                            </p>
                        </div>
                    </div>

                    {auditVelocity.length < 2 ? (
                        <div className="relative flex-1 grid place-items-center text-center px-2">
                            <p className="text-xs font-bold text-ink-subtle">
                                Not enough audit history yet to plot an hourly trend.
                            </p>
                        </div>
                    ) : (
                        <div className="relative flex-1 min-h-[150px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={auditVelocity} margin={{ top: 10, right: 4, left: -22, bottom: 0 }}>
                                    <CartesianGrid
                                        strokeDasharray="4 4"
                                        vertical={false}
                                        stroke="currentColor"
                                        className="text-primary/15 dark:text-slate-800"
                                    />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 800 }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        allowDecimals={false}
                                        tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 800 }}
                                    />
                                    <Tooltip cursor={false} content={<MiniTooltip unit="Event" />} />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#255E91"
                                        strokeWidth={2.5}
                                        fill="url(#velocityGrad)"
                                        dot={{ r: 3.5, fill: '#fff', stroke: '#255E91', strokeWidth: 2 }}
                                        activeDot={{ r: 6, fill: '#CD393B', stroke: '#fff', strokeWidth: 2.5 }}
                                    />
                                    <defs>
                                        <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#CD393B" stopOpacity={0.28} />
                                            <stop offset="100%" stopColor="#255E91" stopOpacity={0.04} />
                                        </linearGradient>
                                    </defs>
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * The soft red bloom plus oversized icon in the top-right corner of a card.
 * Kept in one place so every card shares the exact same treatment.
 */
function CardGraphic({ icon: Icon }: { icon: any }) {
    return (
        <>
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
        </>
    );
}

function MiniStat({ label, value, color }: { label: string; value: any; color: string }) {
    return (
        <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider flex-1 truncate">
                {label}
            </span>
            <span className="text-[12px] font-black text-ink tabular-nums">{value}</span>
        </div>
    );
}

/** Compact tooltip shared by both charts on this page. */
function MiniTooltip({ active, payload, unit }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const value = d.value ?? payload[0].value;
    return (
        <div className="card-brand px-3.5 py-2.5 rounded-xl">
            <p className="text-[10px] font-black text-ink-subtle uppercase tracking-widest mb-0.5">
                {d.label ?? d.name}
            </p>
            <p className="text-sm font-black text-ink">
                {value}
                <span className="text-ink-subtle font-bold ml-1">
                    {value === 1 ? unit : `${unit}s`}
                </span>
            </p>
        </div>
    );
}

function PagerButton({
    children, onClick, disabled, label,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled: boolean;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="w-9 h-9 grid place-items-center rounded-xl border border-primary/20 dark:border-line/10 bg-surface-raised/70 text-ink-muted transition-all hover:bg-primary/10 hover:text-primary-soft hover:border-primary/45 active:scale-95 disabled:opacity-35 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
            {children}
        </button>
    );
}

function StatCard({ icon: Icon, label, value, tone = 'blue' }: any) {
    return (
        <div className="card-brand rounded-[1.75rem] p-6 relative overflow-hidden group transition-all hover:-translate-y-0.5 hover:border-accent/40">
            <CardGraphic icon={Icon} />

            <div className={`relative w-12 h-12 ${TONES[tone] || TONES.blue} rounded-2xl flex items-center justify-center mb-4`}>
                <Icon size={24} />
            </div>
            <p className="relative text-xs font-black uppercase tracking-widest text-ink-subtle mb-1">{label}</p>
            <p className="relative text-2xl font-black text-ink transition-colors capitalize">{value}</p>
        </div>
    );
}

function RoleRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return (
        <div>
            <div className="flex justify-between items-end mb-2 gap-3">
                <p className="text-[11px] font-black text-ink-muted uppercase tracking-widest truncate">{label}</p>
                <p className="text-sm font-black text-ink tabular-nums shrink-0">
                    {count}
                    <span className="text-ink-subtle text-[11px] ml-1.5">{Math.round(percentage)}%</span>
                </p>
            </div>
            <div className="h-2 w-full bg-surface-sunken rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                />
            </div>
        </div>
    );
}
