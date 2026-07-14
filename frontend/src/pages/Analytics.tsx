import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { analytics, surveys } from '../services/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import {
    TrendingUp, Users, CheckCircle2, AlertCircle,
    RefreshCcw, Filter,
    ShieldAlert
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Analytics() {
    const { surveyId } = useParams();
    const [survey, setSurvey] = useState<any>(null);
    const [funnelData, setFunnelData] = useState<any>(null);
    const [trendsData, setTrendsData] = useState<any[]>([]);
    const [orphanData, setOrphanData] = useState<any>(null);
    const [usageStats, setUsageStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        if (!surveyId) return;
        setLoading(true);
        try {
            const [sData, fData, tData, oData, uData] = await Promise.all([
                surveys.get(surveyId),
                analytics.getFunnel(surveyId),
                analytics.getTrends(surveyId),
                analytics.getOrphans(),
                analytics.getUsage(surveyId).catch(() => null)
            ]);
            setSurvey(sData);
            setFunnelData(fData);
            setTrendsData(tData);
            setOrphanData(oData);
            setUsageStats(uData);
        } catch (err) {
            console.error('Failed to fetch analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [surveyId]);

    if (loading) return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 transition-colors">
            <div className="w-12 h-12 rounded-full border-2 border-t-brand-blue border-slate-100 dark:border-slate-800 animate-spin shadow-inner-soft"></div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Loading Analytics</p>
        </div>
    );

    const funnelChartData = [
        { name: 'Unused', value: funnelData?.unused || 0, fill: '#BEBEBE' },      // brand.grey
        { name: 'Passed', value: funnelData?.passed || 0, fill: '#8ACAEC' },      // brand.cyan
        { name: 'Failed', value: funnelData?.failed || 0, fill: '#CD393B' },      // brand.red
        { name: 'Submitted', value: funnelData?.submitted || 0, fill: '#08306B' }, // brand.blue
    ];

    const orphanChartData = orphanData?.categories.map((c: any) => ({
        name: c._id.replace('invalid_transition_', '').replace('_', ' '),
        value: c.count
    })) || [];

    const COLORS = ['#08306B', '#CD393B', '#929292', '#8ACAEC'];

    return (
        <div className="space-y-12 pb-20">
            <div className="max-w-7xl mx-auto space-y-10">

                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 text-left">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 rounded-xl bg-brand-blue/5 text-brand-blue border border-brand-blue/10">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <Link to="/dashboard" className="hover:text-brand-blue transition-colors">Dashboard</Link>
                                <span className="text-slate-200">/</span>
                                <span className="text-brand-blue">{survey?.company_name}</span>
                            </div>
                        </div>
                        <h1 className="text-5xl font-display font-black tracking-tight text-slate-900 dark:text-white transition-colors">
                            Survey <span className="text-slate-400 dark:text-slate-500 font-light italic">Analytics</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={fetchData}
                            className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 dark:text-slate-500 hover:text-brand-blue hover:border-brand-blue/30 transition-all shadow-premium dark:shadow-none active:scale-95"
                            title="Refresh Data"
                        >
                            <RefreshCcw className="w-5 h-5" />
                        </button>
                        <Link
                            to={`/surveys/${surveyId}`}
                            className="flex items-center gap-3 px-8 py-4 bg-brand-blue text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-brand-blue/20"
                        >
                            <Users className="w-5 h-5" />
                            Access Control
                        </Link>
                    </div>
                </header>

                {/* Advanced Analytical Intelligence Phase 5 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-gradient-to-br from-brand-blue to-[#001529] rounded-[3rem] p-10 text-white shadow-2xl shadow-brand-blue/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-1000">
                            <TrendingUp className="w-64 h-64 rotate-12" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[9px] font-black uppercase tracking-widest">
                                    Phase 5 Enabled
                                </div>
                                {survey?.quality_status?.flagged && (
                                    <div className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        Quality Flag
                                    </div>
                                )}
                            </div>
                            <h2 className="text-4xl font-display font-black mb-4">Headless <span className="opacity-50 italic font-light">Service Analytics</span></h2>
                            <p className="text-white/60 text-sm max-w-xl mb-8 leading-relaxed">
                                Our new production-grade engine is now decoupled and running as a headless service.
                                Trigger high-fidelity PPTX reports directly from live MongoDB data.
                            </p>
                            <div className="flex flex-wrap items-center gap-6">
                                <button
                                    onClick={async () => {
                                        try {
                                            const res = await analytics.generateReport(surveyId!);
                                            window.open(`${import.meta.env.VITE_API_URL || ''}/static/${res.report_path}`, '_blank');
                                        } catch (e) {
                                            console.error(e);
                                        }
                                    }}
                                    className="px-8 py-4 bg-white text-brand-blue rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cyan hover:text-white transition-all shadow-xl active:scale-95"
                                >
                                    Generate PPTX Report
                                </button>
                                <div className="h-10 w-[1px] bg-white/10 hidden md:block"></div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">AI Cost Tracking</span>
                                    <span className="text-xl font-display font-black text-brand-cyan">${usageStats?.total_cost_usd || '0.00'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-10 shadow-premium dark:shadow-none flex flex-col justify-between group transition-colors">
                        <div>
                            <h3 className="text-xl font-black font-display mb-2 text-slate-900 dark:text-white transition-colors">Data Quality Loop</h3>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-8 transition-colors">Automated Validation</p>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 transition-colors">
                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">Integrity Score</span>
                                    <span className={`text-sm font-black ${survey?.quality_status?.flagged ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {survey?.quality_status?.score || 100}%
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed italic pr-4">
                                    {survey?.quality_status?.reason || "System reports high data significance and reliable response patterns."}
                                </div>
                            </div>
                        </div>
                        <div className="mt-8 pt-6 border-t border-slate-50 dark:border-slate-800 transition-colors">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em]">Service Status</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Active</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <StatCard
                        title="Total Submissions"
                        value={funnelData?.submitted || 0}
                        icon={<CheckCircle2 className="w-6 h-6" />}
                        trend={`${(funnelData?.completion_rate || 0).toFixed(1)}% Comp. Rate`}
                        color="blue"
                        delay={0.1}
                    />
                    <StatCard
                        title="Qualified Leads"
                        value={funnelData?.passed || 0}
                        icon={<TrendingUp className="w-6 h-6" />}
                        trend={`${(funnelData?.qualification_rate || 0).toFixed(1)}% Qual. Rate`}
                        color="cyan"
                        delay={0.2}
                    />
                    <StatCard
                        title="Qualification Failures"
                        value={funnelData?.failed || 0}
                        icon={<ShieldAlert className="w-6 h-6" />}
                        trend="Initial Drop-off"
                        color="rose"
                        delay={0.3}
                    />
                    <StatCard
                        title="Orphan Submissions"
                        value={orphanData?.total_attempts || 0}
                        icon={<AlertCircle className="w-6 h-6" />}
                        trend="Abandoned Submissions"
                        color="grey"
                        delay={0.4}
                    />
                </div>

                {/* Main Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-left">

                    {/* Trends Chart */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-10 shadow-premium dark:shadow-none relative overflow-hidden group transition-colors">
                        <div className="absolute top-0 right-0 p-8">
                            <div className="w-24 h-24 bg-brand-blue/5 dark:bg-brand-blue/10 rounded-full blur-3xl group-hover:bg-brand-blue/10 dark:group-hover:bg-brand-blue/20 transition-all duration-1000"></div>
                        </div>
                        <h3 className="text-2xl font-black font-display mb-10 flex items-center gap-3 text-slate-900 dark:text-white relative z-10 transition-colors">
                            <TrendingUp className="w-6 h-6 text-brand-blue" />
                            Submission Trends
                        </h3>
                        <div className="h-[350px] relative z-10">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendsData}>
                                    <defs>
                                        <linearGradient id="colorSub" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8ACAEC" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#8ACAEC" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorPass" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#08306B" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#08306B" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="8 8" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
                                    <XAxis
                                        dataKey="_id"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 900 }}
                                        className="text-slate-400 dark:text-slate-600"
                                        tickFormatter={(val) => val.split('-').slice(1).join('/')}
                                        dy={15}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 900 }}
                                        className="text-slate-400 dark:text-slate-600"
                                    />
                                    <Tooltip
                                        cursor={{ stroke: '#08306B', strokeWidth: 2, strokeDasharray: '5 5' }}
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-premium dark:shadow-none transition-colors">
                                                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">{label}</p>
                                                        <div className="space-y-2">
                                                            {payload.map((entry: any, index: number) => (
                                                                <div key={index} className="flex items-center justify-between gap-8">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color, boxShadow: `0 0 10px ${entry.color}60` }}></div>
                                                                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 pr-5">{entry.name}</span>
                                                                    </div>
                                                                    <span className="text-sm font-black text-slate-900 dark:text-white pr-2">{entry.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Area type="monotone" dataKey="submissions" name="Submissions" stroke="#8ACAEC" fillOpacity={1} fill="url(#colorSub)" strokeWidth={4} />
                                    <Area type="monotone" dataKey="passed" name="Qualified" stroke="#08306B" fillOpacity={1} fill="url(#colorPass)" strokeWidth={4} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Funnel Breakdown */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-10 shadow-premium dark:shadow-none relative group transition-colors">
                        <div className="absolute top-0 left-0 p-8">
                            <div className="w-24 h-24 bg-brand-cyan/5 dark:bg-brand-cyan/10 rounded-full blur-3xl group-hover:bg-brand-cyan/10 dark:group-hover:bg-brand-cyan/20 transition-all duration-1000"></div>
                        </div>
                        <h3 className="text-2xl font-black font-display mb-10 flex items-center gap-3 text-slate-900 dark:text-white relative z-10 transition-colors">
                            <Filter className="w-6 h-6 text-brand-blue" />
                            Conversion Funnel
                        </h3>
                        <div className="h-[350px] relative z-10 flex flex-col items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={funnelChartData} layout="vertical" margin={{ left: 20, right: 40 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 900 }} width={80} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(37, 94, 145, 0.03)', radius: 8 }}
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-premium dark:shadow-none transition-colors">
                                                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{label}</p>
                                                        <p className="text-lg font-black text-slate-900 dark:text-white">{payload[0].value} <span className="text-slate-400 dark:text-slate-500 text-xs font-bold ml-1">Entries</span></p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="value" radius={[0, 12, 12, 0]} barSize={32}>
                                        {funnelChartData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={funnelChartData[index].fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="mt-8 grid grid-cols-2 gap-10 w-full px-10">
                                <div className="text-center p-4 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 shadow-inner-soft transition-colors">
                                    <p className="text-3xl font-display font-black text-brand-blue">{(funnelData?.qualification_rate || 0).toFixed(1)}%</p>
                                    <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] font-black mt-1 pr-2">Qualification</p>
                                </div>
                                <div className="text-center p-4 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 shadow-inner-soft transition-colors">
                                    <p className="text-3xl font-display font-black text-brand-cyan">{(funnelData?.completion_rate || 0).toFixed(1)}%</p>
                                    <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] font-black mt-1 pr-2">Finalization</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Orphan Audit & Sub-stats */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left relative z-10">

                    {/* Pass Rate Trend */}
                    <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-10 shadow-premium dark:shadow-none group transition-colors">
                        <h3 className="text-2xl font-black font-display mb-10 text-slate-900 dark:text-white transition-colors">
                            Daily Qualification Analytics
                        </h3>
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendsData}>
                                    <CartesianGrid strokeDasharray="8 8" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
                                    <XAxis
                                        dataKey="_id"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 900 }}
                                        className="text-slate-400 dark:text-slate-600"
                                        tickFormatter={(val) => val.split('-').slice(1).join('/')}
                                        dy={15}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 900 }}
                                        className="text-slate-400 dark:text-slate-600"
                                        domain={[0, 100]}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-slate-900 dark:bg-slate-950 border border-slate-800 p-4 rounded-2xl shadow-xl transition-colors">
                                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
                                                        <p className="text-lg font-black text-white">{payload[0].value}% <span className="text-emerald-400 text-[10px] ml-2">PASSED</span></p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="pass_rate"
                                        name="Pass Rate"
                                        stroke="#08306B"
                                        strokeWidth={5}
                                        dot={{ r: 0 }}
                                        activeDot={{ r: 8, strokeWidth: 0, fill: '#08306B' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Orphan Issues Pie */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-10 shadow-premium dark:shadow-none relative overflow-hidden transition-colors">
                        <div className="absolute top-0 right-0 p-6 opacity-[0.03] dark:opacity-[0.05]">
                            <ShieldAlert className="w-40 h-40 rotate-12 dark:text-white" />
                        </div>
                        <h3 className="text-2xl font-black font-display mb-2 flex items-center gap-3 text-slate-900 dark:text-white transition-colors">
                            Submission Quality
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-10 border-b border-slate-50 dark:border-slate-800 pb-4 transition-colors">Validation Integrity Checks</p>

                        <div className="h-[200px] relative z-10">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={orphanChartData}
                                        innerRadius={65}
                                        outerRadius={85}
                                        paddingAngle={8}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {orphanChartData.map((_entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-premium dark:shadow-none transition-colors">
                                                        <p className="text-xs font-black text-slate-900 dark:text-white">{payload[0].name}: {payload[0].value}</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-8 space-y-3 relative z-10">
                            {orphanData?.categories.map((c: any, i: number) => (
                                <div key={c._id} className="flex items-center justify-between text-[10px] px-5 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-inner-soft group hover:bg-white dark:hover:bg-slate-700 hover:shadow-premium dark:hover:shadow-none transition-all duration-300">
                                    <div className="flex items-center gap-3 truncate pr-2">
                                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                        <span className="text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest truncate group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{c._id.replace('invalid_transition_', '').replace('_', ' ')}</span>
                                    </div>
                                    <span className="font-black text-slate-900 dark:text-white text-xs">{c.count}</span>
                                </div>
                            ))}
                            {(!orphanData || orphanData.categories.length === 0) && (
                                <div className="flex flex-col items-center justify-center py-6 gap-2">
                                    <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 transition-colors">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest transition-colors">System Healthy</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}


function StatCard({ title, value, icon, trend, color, delay = 0 }: any) {
    const colors: any = {
        blue: 'text-brand-blue bg-brand-blue/5 border-brand-blue/10',
        cyan: 'text-brand-cyan bg-brand-cyan/5 border-brand-cyan/10',
        rose: 'text-brand-red bg-brand-red/5 border-brand-red/10',
        grey: 'text-slate-400 bg-slate-50 border-slate-100'
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-8 rounded-[2.5rem] shadow-premium dark:shadow-none transition-all hover:translate-y-[-6px] duration-500 cursor-default text-left relative overflow-hidden group"
        >
            <div className="absolute -right-4 -top-4 opacity-[0.02] dark:opacity-[0.04] group-hover:opacity-[0.05] transition-opacity duration-1000 group-hover:scale-125 transition-transform">
                <TrendingUp className="w-32 h-32 rotate-12 dark:text-white" />
            </div>

            <div className="flex flex-col gap-6 relative z-10">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${colors[color] || colors.grey} transition-transform duration-500 shadow-inner-soft`}>
                    {icon}
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-1 pr-2 transition-colors">{title}</p>
                    <h4 className="text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight transition-colors">{value.toLocaleString()}</h4>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 w-fit px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-700 shadow-inner-soft mt-5 pr-4 transition-colors">
                        <TrendingUp className="w-3.5 h-3.5 text-brand-blue pr-1" />
                        {trend}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
