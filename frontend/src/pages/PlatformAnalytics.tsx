import { useEffect, useState } from 'react';
import { analytics } from '../services/api';
import { motion } from 'framer-motion';
import {
    Activity,
    Users,
    ClipboardList,
    Shield,
    HeartPulse,
    Database,
    Clock,
    UserCircle,
    ArrowUpRight
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

export default function PlatformAnalytics() {
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [loading, setLoading] = useState(true);

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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin"></div>
                    <p className="text-slate-400 dark:text-slate-500 font-bold animate-pulse">Synchronizing Platform Data...</p>
                </div>
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div className="space-y-10">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight transition-colors">
                    Platform <span className="text-brand-blue">Intelligence</span>
                </h1>
                <p className="text-slate-500 dark:text-slate-400 font-medium mt-1 transition-colors">Global ecosystem health and usage telemetry</p>
            </div>

            {/* Top Grid - System Health */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    icon={HeartPulse}
                    label="System Status"
                    value={stats.system.status}
                    color="text-emerald-500 dark:text-emerald-400"
                    bg="bg-emerald-50 dark:bg-emerald-500/10"
                />
                <StatCard
                    icon={Activity}
                    label="Platform Uptime"
                    value={stats.system.uptime}
                    color="text-brand-blue dark:text-brand-blue"
                    bg="bg-brand-blue/5 dark:bg-brand-blue/10"
                />
                <StatCard
                    icon={Users}
                    label="Global Identities"
                    value={stats.users.total}
                    color="text-brand-cyan dark:text-brand-cyan"
                    bg="bg-cyan-50 dark:bg-brand-cyan/10"
                />
                <StatCard
                    icon={ClipboardList}
                    label="Survey Volume"
                    value={stats.platform.surveys}
                    color="text-brand-accent dark:text-brand-accent"
                    bg="bg-rose-50 dark:bg-brand-accent/10"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* User Distribution */}
                <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none transition-colors">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
                            <Shield size={20} />
                        </div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">User Hierarchy</h2>
                    </div>

                    <div className="space-y-6">
                        <RoleRow label="Account Admins" count={stats.users.admins} total={stats.users.total} color="bg-brand-blue" />
                        <RoleRow label="Market Analysts" count={stats.users.analysts} total={stats.users.total} color="bg-brand-cyan" />
                        <RoleRow label="Partner Clients" count={stats.users.clients} total={stats.users.total} color="bg-emerald-400" />
                    </div>
                </div>

                {/* Audit Trail */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none transition-colors">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
                                <Database size={20} />
                            </div>
                            <h2 className="text-lg font-black text-slate-900 dark:text-white">Recent Audit Logs</h2>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Live Stream</span>
                    </div>

                    <div className="overflow-hidden">
                        <div className="space-y-4">
                            {stats.recent_audit.map((log) => (
                                <div key={log._id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:shadow-md transition-all">
                                            <UserCircle size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900 dark:text-white transition-colors">
                                                {log.username} <span className="text-slate-400 dark:text-slate-500 font-bold ml-2">performed</span> <span className="text-brand-blue">{log.action.replace('_', ' ')}</span>
                                            </p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{log.resource_type}</span>
                                                <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                                                <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 font-bold text-[10px]">
                                                    <Clock size={10} />
                                                    {new Date(log.timestamp).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <ArrowUpRight size={16} className="text-slate-200 dark:text-slate-700 group-hover:text-brand-blue transition-colors" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, color, bg }: any) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/30 dark:shadow-none transition-colors">
            <div className={`w-12 h-12 ${bg} ${color} rounded-2xl flex items-center justify-center mb-4`}>
                <Icon size={24} />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-black text-slate-900 dark:text-white transition-colors`}>{value}</p>
        </div>
    );
}

function RoleRow({ label, count, total, color }: { label: string, count: number, total: number, color: string }) {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return (
        <div>
            <div className="flex justify-between items-end mb-2">
                <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest transition-colors">{label}</p>
                <p className="text-sm font-black text-slate-900 dark:text-white transition-colors">{count}</p>
            </div>
            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden transition-colors">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    className={`h-full ${color}`}
                />
            </div>
        </div>
    );
}
