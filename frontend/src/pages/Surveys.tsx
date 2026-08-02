import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { surveys } from '../services/api';
import { SurveyStateToggle } from '../components/SurveyStateManagement';
import {
    Plus,
    Users,
    TrendingUp,
    Trash2,
    Search,
    ClipboardList,
    CheckCircle2,
    Eye,
    Sparkles,
    Layers,
    Tag,
    User,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const PAGE_SIZE = 5;

export default function SurveysPage() {
    const [surveyList, setSurveyList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'draft' | 'closed'>('all');
    const [page, setPage] = useState(1);

    const fetchSurveys = async () => {
        try {
            const data = await surveys.list();
            setSurveyList(data);
        } catch (err) {
            toast.error('Failed to load surveys');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSurveys();
    }, []);

    const handleDelete = async (id: string) => {
        try {
            await surveys.delete(id);
            toast.success('Survey archived successfully');
            setDeletingId(null);
            fetchSurveys();
        } catch (err) {
            toast.error('Failed to archive survey');
        }
    };

    const filteredSurveys = surveyList.filter((s: any) => {
        const matchesSearch =
            s.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.survey_code && s.survey_code.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const totalPages = Math.max(1, Math.ceil(filteredSurveys.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const paginatedSurveys = filteredSurveys.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    const counts = {
        all: surveyList.length,
        active: surveyList.filter((s: any) => s.status === 'active').length,
        draft: surveyList.filter((s: any) => s.status === 'draft').length,
        closed: surveyList.filter((s: any) => s.status === 'closed').length,
    };

    if (loading) return (
        <div className="space-y-10 pb-20 animate-pulse">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
                <div className="space-y-4 w-full max-w-xl">
                    <div className="h-8 w-40 bg-slate-200/50 dark:bg-slate-800/50 rounded-lg"></div>
                    <div className="h-14 w-64 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl"></div>
                    <div className="h-6 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-lg"></div>
                </div>
                <div className="flex gap-4">
                    <div className="h-12 w-64 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl"></div>
                    <div className="h-12 w-44 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl"></div>
                </div>
            </div>
            <div className="flex gap-2">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-10 w-24 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl"></div>
                ))}
            </div>
            <div className="h-[600px] bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-slate-800/20 rounded-[3rem] w-full"></div>
        </div>
    );

    return (
        <div className="space-y-10 pb-20">
            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {deletingId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 max-w-md w-full border border-slate-100 dark:border-slate-800 shadow-2xl text-center"
                        >
                            <div className="w-20 h-20 bg-rose-50 dark:bg-rose-950/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-rose-100 dark:border-rose-900/30">
                                <Trash2 className="w-10 h-10 text-rose-500" />
                            </div>
                            <h3 className="text-2xl font-display font-black mb-3 text-slate-900 dark:text-white">Archive Survey?</h3>
                            <p className="text-slate-700 dark:text-slate-300 font-bold mb-8 leading-relaxed">
                                This survey will be archived. Associated links remain valid but the survey will no longer appear in the active registry.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setDeletingId(null)}
                                    className="px-6 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDelete(deletingId)}
                                    className="px-6 py-4 rounded-2xl bg-rose-500 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-all"
                                >
                                    Archive
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue border border-brand-blue/10 dark:border-brand-blue/30">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300 font-display">
                            Research <span className="text-brand-blue">Registry</span>
                        </div>
                    </div>
                    <h1 className="text-5xl font-display font-black tracking-tight leading-none text-slate-900 dark:text-white">
                        Surveys
                    </h1>
                    <p className="mt-4 text-slate-800 dark:text-slate-300 max-w-xl font-bold leading-relaxed">
                        All active and archived research deployments. Manage survey lifecycle, access tokens, and analytics.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-brand-blue transition-colors" />
                        <input
                            type="text"
                            placeholder="Search surveys..."
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                            }}
                            className="w-full sm:w-64 bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-4 text-slate-900 dark:text-white font-bold focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-blue/50 focus:ring-4 focus:ring-brand-blue/30 transition-all shadow-sm"
                        />
                    </div>
                    <Link
                        to="/create-survey"
                        className="btn-premium flex items-center justify-center gap-3 group shadow-xl shadow-brand-blue/20 font-black tracking-widest uppercase text-xs hover:-translate-y-0.5 active:scale-95 transition-all"
                    >
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
                        Create Survey
                    </Link>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-2 w-fit shadow-sm">
                {(['all', 'active', 'draft', 'closed'] as const).map((status) => (
                    <button
                        key={status}
                        onClick={() => {
                            setFilterStatus(status);
                            setPage(1);
                        }}
                        className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === status
                            ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20'
                            : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                    >
                        {status} <span className="opacity-60 ml-1">({counts[status]})</span>
                    </button>
                ))}
            </div>

            {/* Surveys Table */}
            <div className="bg-white dark:bg-slate-900/50 rounded-[3rem] border border-slate-100 dark:border-slate-800/50 overflow-hidden shadow-premium relative transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="text-left text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-[0.2em] bg-slate-100 dark:bg-slate-800/80">
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Company Domain</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700 text-center">Project Code</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700 text-center">Lifecycle</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Creator</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Configuration Summary</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Collection Velocity</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Service Status</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700 text-right">Operations</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            <AnimatePresence mode="popLayout">
                                {paginatedSurveys.map((survey: any, idx: number) => (
                                    <motion.tr
                                        key={survey._id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: idx * 0.04 }}
                                        className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                                    >
                                        <td className="px-10 py-7 border-b border-slate-50 dark:border-slate-800/50">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-300 dark:border-slate-700 group-hover:border-brand-blue/30 group-hover:bg-brand-blue/5 transition-all font-display font-black text-slate-600 dark:text-slate-400 group-hover:text-brand-blue text-base">
                                                    {survey.company_name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-black text-base text-slate-900 dark:text-white group-hover:text-brand-blue transition-colors">
                                                        {survey.company_name}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                                        ID: {survey._id.slice(-6).toUpperCase()}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-slate-100 dark:border-slate-800/50 text-center">
                                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                                <Tag className="w-3 h-3 text-brand-blue" />
                                                <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">{survey.survey_code || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-slate-100 dark:border-slate-800/50 text-center border-x shadow-inner">
                                            <div className="inline-flex flex-col items-center">
                                                <div className="text-[11px] font-black text-slate-900 dark:text-white leading-none">
                                                    {new Date(survey.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </div>
                                                <div className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                                                    {new Date(survey.created_at).getFullYear()}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-slate-100 dark:border-slate-800/50">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-brand-blue/10 flex items-center justify-center text-brand-blue border border-brand-blue/10">
                                                    <User size={14} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase truncate max-w-[80px]">{survey.created_by || 'system'}</span>
                                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Analyst</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-slate-100 dark:border-slate-800/50">
                                            <div className="flex flex-col gap-4 py-1 min-w-[240px]">
                                                {/* 1. Funnel Status - Micro Action Label */}
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-1.5 rounded-lg border transition-all ${survey.purchase_funnel?.is_enabled
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                                                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'}`}>
                                                        <Sparkles size={12} className={survey.purchase_funnel?.is_enabled ? 'animate-pulse' : ''} />
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Purchase Funnel</span>
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${survey.purchase_funnel?.is_enabled ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                            {survey.purchase_funnel?.is_enabled ? 'Active Engine' : 'N/A'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* 2. Scale & Complexity */}
                                                <div className="flex items-center gap-3">
                                                    <div className="p-1.5 rounded-lg bg-brand-blue/10 border border-brand-blue/20 text-brand-blue">
                                                        <CheckCircle2 size={12} />
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Research Scale</span>
                                                        <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">
                                                            {(() => {
                                                                const aggregateCount = [
                                                                    survey.template_snapshot_schema, // L1
                                                                    survey.template_snapshot_l2,     // L2
                                                                    survey.template_snapshot_l3,     // L3
                                                                    survey.template_snapshot_l4      // L4
                                                                ].reduce((acc, layer) => {
                                                                    if (!layer?.sections) return acc;
                                                                    return acc + layer.sections.reduce((sAcc: number, s: any) => sAcc + (s.questions?.length || 0), 0);
                                                                }, 0);

                                                                const fallbackCount = Array.isArray(survey.template_snapshot_questions) ? survey.template_snapshot_questions.length : 0;

                                                                return (aggregateCount || fallbackCount) + (survey.purchase_funnel?.is_enabled ? 7 : 0);
                                                            })()} Logic Probes
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* 3. Taxonomy: Category & Industry */}
                                                <div className="flex items-center gap-3">
                                                    <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-500">
                                                        <Layers size={12} />
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 text-left">
                                                        <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Taxonomy Domain</span>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight truncate max-w-[150px]">
                                                                {survey.purchase_funnel?.category_name || survey.blueprint?.category || 'General Product'}
                                                            </span>
                                                            <span className="text-[10px] font-black text-brand-blue uppercase tracking-widest leading-none mt-0.5">
                                                                {survey.industry || 'Cross-Sector'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 4. Social Economic Level (SEC) */}
                                                <div className="flex items-center gap-3">
                                                    <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-500">
                                                        <Users size={12} />
                                                    </div>
                                                    <div className="flex flex-col gap-1.5 text-left">
                                                        <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Social Economic Level</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {Array.isArray(survey.sec_classes) && survey.sec_classes.length > 0 ? (
                                                                survey.sec_classes.map((sec: string) => (
                                                                    <span key={sec} className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded text-[8px] font-black text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm uppercase tracking-tighter">
                                                                        {sec}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic opacity-60">Global Focus</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-slate-100 dark:border-slate-800/50">
                                            <div className="flex flex-col gap-2 min-w-[140px]">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-lg font-black text-slate-900 dark:text-white leading-none">
                                                            {survey.respondent_count || 0}
                                                        </span>
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reached</span>
                                                    </div>
                                                    <span className="text-[9px] font-black text-brand-blue/60 uppercase">Target: {survey.sample_capacity || 0}</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${survey.sample_capacity ? Math.min(100, Math.round((survey.respondent_count || 0) / survey.sample_capacity * 100)) : 0}%` }}
                                                        className={`h-full rounded-full transition-all ${survey.sample_capacity > 0 && survey.respondent_count >= survey.sample_capacity
                                                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                                                            : 'bg-gradient-to-r from-brand-blue to-blue-400'
                                                            }`}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-slate-50 dark:border-slate-800/50">
                                            <SurveyStateToggle
                                                currentStatus={survey.status}
                                                onTransition={async (newStatus) => {
                                                    await surveys.update(survey._id, { status: newStatus });
                                                    fetchSurveys();
                                                }}
                                            />
                                        </td>
                                        <td className="px-10 py-7 border-b border-slate-50 dark:border-slate-800/50">
                                            <div className="flex justify-end gap-2 pr-2">
                                                <Link
                                                    to={`/surveys/${survey._id}/responses`}
                                                    className="p-3 rounded-xl bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 transition-all border border-violet-500/10 active:scale-95"
                                                    title="Responses"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Link>
                                                <Link
                                                    to={`/surveys/${survey._id}`}
                                                    className="p-3 rounded-xl bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 transition-all border border-brand-blue/10 active:scale-95"
                                                    title="Tokens"
                                                >
                                                    <Users className="w-4 h-4" />
                                                </Link>
                                                <Link
                                                    to={`/analytics/${survey._id}`}
                                                    className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all border border-emerald-500/10 active:scale-95"
                                                    title="Analytics"
                                                >
                                                    <TrendingUp className="w-4 h-4" />
                                                </Link>
                                                <div className="w-[1px] h-10 bg-slate-100 dark:bg-slate-800 mx-1"></div>
                                                <button
                                                    onClick={() => setDeletingId(survey._id)}
                                                    className="p-3 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all border border-rose-500/10 active:scale-95"
                                                    title="Archive"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                            {filteredSurveys.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="py-24 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="relative mb-6 group cursor-default text-center mx-auto">
                                                <div className="absolute inset-0 bg-brand-blue/10 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                                                <div className="w-20 h-20 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center border border-white/80 dark:border-slate-800 shadow-xl relative z-10 group-hover:-translate-y-1 transition-transform duration-500 mx-auto">
                                                    <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
                                                </div>
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-display font-black text-slate-900 dark:text-white mb-2">No surveys found</h3>
                                                <p className="text-slate-500 dark:text-slate-400 font-medium mb-8 max-w-sm mx-auto">
                                                    {searchQuery ? 'Try adjusting your search terms.' : 'Create your first survey to get started in the research registry.'}
                                                </p>
                                            </div>
                                            {!searchQuery && (
                                                <Link to="/create-survey" className="btn-premium flex items-center justify-center gap-3 group shadow-xl shadow-brand-blue/20 font-black tracking-widest uppercase text-xs hover:-translate-y-0.5 active:scale-95 transition-all">
                                                    <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
                                                    Create First Survey
                                                </Link>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {filteredSurveys.length > 0 && (
                    <div className="flex items-center justify-between gap-4 px-10 py-6 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-800/20">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredSurveys.length)} of {filteredSurveys.length}
                        </span>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
                                Page {currentPage} <span className="text-slate-300 dark:text-slate-600">of</span> {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-30 shadow-sm text-slate-400"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-30 shadow-sm text-slate-400"
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
