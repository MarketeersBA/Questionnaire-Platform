import { useEffect, useState } from 'react';
import { surveys, analytics } from '../../services/api';
import {
    BarChart3,
    ArrowLeftRight,
    X,
    TrendingUp,
    Target,
    Activity,
    Search
} from 'lucide-react';
import { toast } from 'sonner';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

export default function ComparisonAnalytics() {
    const [allSurveys, setAllSurveys] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [comparisonData, setComparisonData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchSurveys();
    }, []);

    const fetchSurveys = async () => {
        try {
            const data = await surveys.list();
            setAllSurveys(data);
        } catch (err) {
            toast.error('Failed to load surveys');
        }
    };

    const handleToggleSurvey = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    useEffect(() => {
        if (selectedIds.length > 0) {
            runComparison();
        } else {
            setComparisonData([]);
        }
    }, [selectedIds]);

    const runComparison = async () => {
        setLoading(true);
        try {
            const data = await analytics.compare(selectedIds);
            setComparisonData(data);
        } catch (err) {
            toast.error('Comparison failed');
        } finally {
            setLoading(false);
        }
    };

    const filteredSurveys = allSurveys.filter(s =>
        s.company_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedIds.includes(s._id)
    );

    return (
        <div className="space-y-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight transition-colors">
                        Comparative <span className="text-brand-blue">Intelligence</span>
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Contrast performance protocols across multiple domains</p>
                </div>
                <div className="flex items-center gap-3 bg-brand-blue/5 dark:bg-brand-blue/10 px-6 py-3 rounded-2xl border border-brand-blue/10 transition-colors">
                    <ArrowLeftRight className="text-brand-blue w-5 h-5" />
                    <span className="text-brand-blue font-black text-xs uppercase tracking-widest">{selectedIds.length} Selections</span>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-8 items-start">
                {/* Selector Sidebar */}
                <div className="col-span-12 lg:col-span-3 space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-8 shadow-sm transition-colors">
                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Find surveys..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl pl-11 pr-4 py-3 text-sm font-bold focus:ring-2 focus:ring-brand-blue/20 dark:text-white transition-all shadow-inner-soft"
                            />
                        </div>

                        <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                            {filteredSurveys.map((survey) => (
                                <button
                                    key={survey._id}
                                    onClick={() => handleToggleSurvey(survey._id)}
                                    className="w-full text-left p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-700 group"
                                >
                                    <p className="font-black text-slate-900 dark:text-white leading-none mb-1 group-hover:text-brand-blue transition-colors">{survey.company_name}</p>
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">
                                        ID: {survey._id.slice(-6).toUpperCase()}
                                    </p>
                                </button>
                            ))}
                            {filteredSurveys.length === 0 && (
                                <div className="text-center py-10 opacity-30 dark:opacity-20 italic text-sm dark:text-slate-400">
                                    No more surveys available
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Active Selections */}
                    {selectedIds.length > 0 && (
                        <div className="bg-slate-900 dark:bg-slate-950 rounded-[2.5rem] p-8 shadow-xl shadow-black/10 border border-white/5 transition-colors">
                            <h3 className="text-white text-xs font-black uppercase tracking-widest mb-6 px-1">Active Comparisons</h3>
                            <div className="space-y-3">
                                {selectedIds.map(id => {
                                    const s = allSurveys.find(item => item._id === id);
                                    return (
                                        <div key={id} className="flex items-center justify-between bg-white/5 border border-white/10 p-3 rounded-xl hover:bg-white/10 transition-colors">
                                            <span className="text-white text-[11px] font-bold truncate max-w-[150px]">{s?.company_name || '...'}</span>
                                            <button
                                                onClick={() => handleToggleSurvey(id)}
                                                className="text-white/30 hover:text-brand-red transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Comparison Viz */}
                <div className="col-span-12 lg:col-span-9">
                    {selectedIds.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 border-dashed p-20 flex flex-col items-center justify-center text-center transition-colors">
                            <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-[2.5rem] flex items-center justify-center text-slate-200 dark:text-slate-700 mb-8 border border-slate-100 dark:border-slate-800 shadow-inner-soft">
                                <BarChart3 size={40} />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Comparative Hub</h2>
                            <p className="text-slate-400 dark:text-slate-500 max-w-sm font-medium mb-10 leading-relaxed">
                                Select multiple surveys from the registry to contrast their engagement, completion rates, and market saturation.
                            </p>
                            <div className="flex gap-4">
                                <span className="bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100 dark:border-slate-700 mb-6">Discovery Mode Active</span>
                            </div>
                        </div>
                    ) : loading ? (
                        <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 p-20 flex flex-col items-center justify-center gap-6 shadow-sm transition-colors">
                            <div className="w-12 h-12 border-4 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin"></div>
                            <p className="text-slate-400 dark:text-slate-500 font-bold animate-pulse">Running Advanced Telemetry...</p>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Charts Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Engagement Comparison */}
                                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors">
                                    <div className="flex items-center justify-between mb-10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue flex items-center justify-center">
                                                <TrendingUp size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-slate-900 dark:text-white">Participation Volume</h3>
                                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Total engagement across domains</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={comparisonData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: 'currentColor' }} className="text-slate-400 dark:text-slate-600" />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: 'currentColor' }} className="text-slate-400 dark:text-slate-600" />
                                                <Tooltip
                                                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                                    content={({ active, payload, label }) => {
                                                        if (active && payload && payload.length) {
                                                            return (
                                                                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-premium dark:shadow-none transition-colors">
                                                                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">{label}</p>
                                                                    {payload.map((entry: any, index: number) => (
                                                                        <div key={index} className="flex items-center justify-between gap-8">
                                                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 pr-5">{entry.name}</span>
                                                                            <span className="text-sm font-black text-slate-900 dark:text-white">{entry.value}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar dataKey="stats.total" name="Participations" fill="#255E91" radius={[8, 8, 0, 0]} barSize={24} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Completion Rate Comparison */}
                                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors">
                                    <div className="flex items-center justify-between mb-10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-brand-cyan/5 dark:bg-brand-cyan/10 text-brand-cyan flex items-center justify-center">
                                                <Target size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-slate-900 dark:text-white">Efficiency Index</h3>
                                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Completion rates contrast</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={comparisonData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: 'currentColor' }} className="text-slate-400 dark:text-slate-600" />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: 'currentColor' }} className="text-slate-400 dark:text-slate-600" unit="%" />
                                                <Tooltip
                                                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                                    content={({ active, payload, label }) => {
                                                        if (active && payload && payload.length) {
                                                            return (
                                                                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-premium dark:shadow-none transition-colors">
                                                                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">{label}</p>
                                                                    {payload.map((entry: any, index: number) => (
                                                                        <div key={index} className="flex items-center justify-between gap-8">
                                                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 pr-5">{entry.name}</span>
                                                                            <span className="text-sm font-black text-slate-900 dark:text-white">{entry.value}%</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar dataKey="completion_rate" name="Completion Rate (%)" fill="#00D2FF" radius={[8, 8, 0, 0]} barSize={24} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Table */}
                            <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors">
                                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 transition-colors">
                                    <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Comparative Registry</h3>
                                    <Activity className="text-slate-300 dark:text-slate-600 w-5 h-5" />
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                                                <th className="px-8 py-5">Survey Domain</th>
                                                <th className="px-8 py-5">Total Engaged</th>
                                                <th className="px-8 py-5">Qualified (Pass)</th>
                                                <th className="px-8 py-5">Submissions</th>
                                                <th className="px-8 py-5 text-right">Yield Index</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                            {comparisonData.map((item) => (
                                                <tr key={item.survey_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                                    <td className="px-8 py-6">
                                                        <span className="font-black text-slate-900 dark:text-white group-hover:text-brand-blue transition-colors">{item.name}</span>
                                                    </td>
                                                    <td className="px-8 py-6 font-bold text-slate-500 dark:text-slate-400">{item.stats.total}</td>
                                                    <td className="px-8 py-6 font-bold text-slate-500 dark:text-slate-400">{item.stats.passed}</td>
                                                    <td className="px-8 py-6 font-bold text-slate-500 dark:text-slate-400">{item.stats.submitted}</td>
                                                    <td className="px-8 py-6 text-right">
                                                        <span className={`inline-flex px-3 py-1.5 rounded-full text-[10px] font-black ${item.completion_rate > 70 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                                            item.completion_rate > 40 ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                                                                'bg-rose-50 dark:bg-rose-500/10 text-brand-red'
                                                            }`}>
                                                            {item.completion_rate.toFixed(1)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
