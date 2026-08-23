import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { surveys, analytics } from '../services/api';
import { getMasterLink } from '../utils/surveyLinks';
import { toast } from 'sonner';
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
    ChevronRight,
    Pencil,
    RefreshCw,
    Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_SIZE = 5;

type TokenSummary = {
    unused: number;
    passed: number;
    failed: number;
    submitted: number;
    total: number;
};

const EMPTY_SUMMARY: TokenSummary = { unused: 0, passed: 0, failed: 0, submitted: 0, total: 0 };

export default function SurveysPage() {
    const [surveyList, setSurveyList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'draft' | 'closed'>('all');
    const [page, setPage] = useState(1);
    const [reportStatuses, setReportStatuses] = useState<Record<string, string>>({});

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

    const copyMasterLink = (surveyId: string) => {
        const url = getMasterLink(surveyId);
        const notify = () => toast.success('Master link copied — share it with respondents');
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(url).then(notify).catch(() => {
                const el = document.createElement('textarea');
                el.value = url;
                el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
                document.body.appendChild(el);
                el.focus();
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                notify();
            });
        } else {
            const el = document.createElement('textarea');
            el.value = url;
            el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
            document.body.appendChild(el);
            el.focus();
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            notify();
        }
    };

    const filteredSurveys = surveyList.filter((s: any) => {
        const companyName = s.company_name || s.name || '';
        const matchesSearch =
            companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
    const pageSurveyIds = paginatedSurveys.map((s: any) => s._id).join(',');

    useEffect(() => {
        const ids = pageSurveyIds ? pageSurveyIds.split(',') : [];
        if (ids.length === 0) return;

        let cancelled = false;
        
        const fetchStatuses = async () => {
            if (ids.length === 0) return;

            const results = await Promise.all(
                ids.map(async (id: string) => {
                    try {
                        const res = await analytics.getReportStatus(id);
                        return [id, res?.data?.status || 'none'] as const;
                    } catch {
                        return [id, 'none'] as const;
                    }
                })
            );
            
            if (cancelled) return;
            
            setReportStatuses((prev) => {
                const next = { ...prev };
                for (const [id, status] of results) next[id] = status;
                return next;
            });
        };

        fetchStatuses();

        // Optional polling every 10 seconds for surveys that are currently generating
        const generatingIds = paginatedSurveys
            .filter((s: any) => reportStatuses[s._id] === 'generating')
            .map((s: any) => s._id);
            
        let interval: NodeJS.Timeout | null = null;
        if (generatingIds.length > 0) {
            interval = setInterval(fetchStatuses, 10000);
        }

        return () => {
            cancelled = true;
            if (interval) clearInterval(interval);
        };
    }, [pageSurveyIds, paginatedSurveys, reportStatuses]);

    const handleGenerateReport = async (surveyId: string) => {
        try {
            setReportStatuses(prev => ({ ...prev, [surveyId]: 'generating' }));
            await analytics.generateReport(surveyId, {}, true);
            toast.success('Report generation started in the background');
        } catch (err) {
            toast.error('Failed to trigger report generation');
            setReportStatuses(prev => ({ ...prev, [surveyId]: 'failed' }));
        }
    };

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
                            className="bg-surface rounded-[2.5rem] p-10 max-w-md w-full border border-line/80 dark:border-line/10 shadow-2xl text-center"
                        >
                            <div className="w-20 h-20 bg-rose-50 dark:bg-rose-950/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-rose-100 dark:border-rose-900/30">
                                <Trash2 className="w-10 h-10 text-rose-500" />
                            </div>
                            <h3 className="text-2xl font-display font-black mb-3 text-ink">Archive Survey?</h3>
                            <p className="text-ink-muted font-bold mb-8 leading-relaxed">
                                This survey will be archived. Associated links remain valid but the survey will no longer appear in the active registry.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setDeletingId(null)}
                                    className="px-6 py-4 rounded-2xl bg-surface-raised text-ink-muted font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
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
                        <div className="p-2 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary-soft border border-primary/10 dark:border-primary/30">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted font-display">
                            Research <span className="text-primary-soft">Registry</span>
                        </div>
                    </div>
                    <h1 className="text-5xl font-display font-black tracking-tight leading-none text-ink">
                        Surveys
                    </h1>
                    <p className="mt-4 text-slate-800 dark:text-slate-300 max-w-xl font-bold leading-relaxed">
                        All active and archived research deployments. Manage survey lifecycle, access tokens, and analytics.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-soft transition-colors" />
                        <input
                            type="text"
                            placeholder="Search surveys..."
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                            }}
                            className="w-full sm:w-64 bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-line/80 dark:border-line/10 rounded-2xl pl-12 pr-6 py-4 text-ink font-bold focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/30 transition-all shadow-sm"
                        />
                    </div>
                    <Link
                        to="/create-survey"
                        className="btn-premium flex items-center justify-center gap-3 group shadow-xl shadow-primary/20 font-black tracking-widest uppercase text-xs hover:-translate-y-0.5 active:scale-95 transition-all"
                    >
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
                        Create Survey
                    </Link>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 bg-surface border border-line/80 dark:border-line/10 rounded-2xl p-2 w-fit shadow-sm">
                {(['all', 'active', 'draft', 'closed'] as const).map((status) => (
                    <button
                        key={status}
                        onClick={() => {
                            setFilterStatus(status);
                            setPage(1);
                        }}
                        className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === status
                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                            : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                    >
                        {status} <span className="opacity-60 ml-1">({counts[status]})</span>
                    </button>
                ))}
            </div>

            {/* Surveys Table */}
            <div className="bg-surface/50 rounded-[3rem] border border-line/80 dark:border-line/10 overflow-hidden shadow-premium relative transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="text-left text-[10px] font-black text-ink-muted uppercase tracking-[0.2em] bg-surface-sunken/80">
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Company Domain</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700 text-center">Project Code</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700 text-center">Lifecycle</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Creator</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Target Progress</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700">Service Status</th>
                                <th className="px-10 py-6 border-b border-slate-200 dark:border-slate-700 text-center">Report Pipeline</th>
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
                                                <div className="w-12 h-12 bg-surface-sunken rounded-2xl flex items-center justify-center border border-slate-300 dark:border-slate-700 group-hover:border-primary/30 group-hover:bg-primary/5 transition-all font-display font-black text-ink-muted group-hover:text-primary-soft text-base">
                                                    {(survey.company_name || survey.name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-black text-base text-ink group-hover:text-primary-soft transition-colors">
                                                        {survey.company_name || survey.name || 'Untitled Survey'}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-ink-subtle uppercase tracking-widest flex items-center gap-1">
                                                        ID: {survey._id.slice(-6).toUpperCase()}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-line/80 dark:border-line/10 text-center">
                                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-sunken rounded-lg border border-slate-200 dark:border-slate-700">
                                                <Tag className="w-3 h-3 text-primary-soft" />
                                                <span className="text-[10px] font-black text-ink-muted uppercase tracking-wider">{survey.survey_code || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-line/80 dark:border-line/10 text-center border-x shadow-inner">
                                            <div className="inline-flex flex-col items-center">
                                                <div className="text-[11px] font-black text-ink leading-none">
                                                    {new Date(survey.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </div>
                                                <div className="text-[8px] font-black text-ink-subtle uppercase tracking-widest mt-1">
                                                    {new Date(survey.created_at).getFullYear()}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-7 border-b border-line/80 dark:border-line/10">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary-soft border border-primary/10">
                                                    <User size={14} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-ink uppercase truncate max-w-[80px]">{survey.created_by || 'system'}</span>
                                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Analyst</span>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-10 py-7 border-b border-line/80 dark:border-line/10">
                                            <div className="flex flex-col gap-3 min-w-[200px]">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex items-baseline gap-1.5">
                                                        <span className="text-xl font-black text-ink leading-none">
                                                            {survey.respondent_count || 0}
                                                        </span>
                                                        <span className="text-xs font-bold text-ink-muted uppercase tracking-wide">Reached</span>
                                                    </div>
                                                    <span className="text-xs font-bold text-primary-soft uppercase tracking-wide">Target: {survey.sample_capacity || 0}</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-surface-sunken rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${survey.sample_capacity ? Math.min(100, Math.round((survey.respondent_count || 0) / survey.sample_capacity * 100)) : 0}%` }}
                                                        className={`h-full rounded-full transition-all ${survey.sample_capacity > 0 && survey.respondent_count >= survey.sample_capacity
                                                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                                                            : 'bg-gradient-to-r from-primary to-blue-400'
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
                                        <td className="px-10 py-7 border-b border-slate-50 dark:border-slate-800/50 text-center">
                                            {(() => {
                                                const status = reportStatuses[survey._id];
                                                if (status === 'complete' || status === 'ready') {
                                                    return (
                                                        <div className="flex flex-col items-center gap-2">
                                                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">Ready</span>
                                                            <Link
                                                                to={`/surveys/${survey._id}/report`}
                                                                className="px-5 py-2.5 bg-primary text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-primary/30 hover:-translate-y-0.5 transition-all w-full text-center"
                                                            >
                                                                View Report
                                                            </Link>
                                                        </div>
                                                    );
                                                }
                                                if (status === 'generating') {
                                                    return (
                                                        <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 text-amber-600 font-black text-xs uppercase tracking-wider border border-amber-500/30 mx-auto shadow-sm">
                                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                                            In Progress
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <button
                                                        onClick={() => handleGenerateReport(survey._id)}
                                                        className="px-5 py-2.5 bg-primary/5 border border-primary/40 text-primary-soft text-xs font-black uppercase tracking-wider rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm w-full"
                                                    >
                                                        Generate Report
                                                    </button>
                                                );
                                            })()}
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
                                                <button
                                                    onClick={() => copyMasterLink(survey._id)}
                                                    className="p-3 rounded-xl bg-primary/10 text-primary-soft hover:bg-primary/20 transition-all border border-primary/10 active:scale-95"
                                                    title="Copy Master Link"
                                                >
                                                    <Users className="w-4 h-4" />
                                                </button>
                                                <Link
                                                    to={`/analytics/${survey._id}`}
                                                    className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all border border-emerald-500/10 active:scale-95"
                                                    title="Analytics"
                                                >
                                                    <TrendingUp className="w-4 h-4" />
                                                </Link>
                                                {survey.status !== 'closed' && (
                                                    <Link
                                                        to={`/surveys/${survey._id}/edit`}
                                                        className="p-3 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-all border border-amber-500/10 active:scale-95"
                                                        title="Edit Survey"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Link>
                                                )}
                                                <div className="w-[1px] h-10 bg-surface-sunken mx-1"></div>
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
                                                <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                                                <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center border border-white/80 dark:border-slate-800 shadow-xl relative z-10 group-hover:-translate-y-1 transition-transform duration-500 mx-auto">
                                                    <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
                                                </div>
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-display font-black text-ink mb-2">No surveys found</h3>
                                                <p className="text-ink-muted font-medium mb-8 max-w-sm mx-auto">
                                                    {searchQuery ? 'Try adjusting your search terms.' : 'Create your first survey to get started in the research registry.'}
                                                </p>
                                            </div>
                                            {!searchQuery && (
                                                <Link to="/create-survey" className="btn-premium flex items-center justify-center gap-3 group shadow-xl shadow-primary/20 font-black tracking-widest uppercase text-xs hover:-translate-y-0.5 active:scale-95 transition-all">
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
                    <div className="flex items-center justify-between gap-4 px-10 py-6 border-t border-line/80 dark:border-line/10 bg-slate-50/50 dark:bg-slate-800/20">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredSurveys.length)} of {filteredSurveys.length}
                        </span>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest bg-surface-sunken px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
                                Page {currentPage} <span className="text-slate-300 dark:text-slate-600">of</span> {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2.5 bg-surface border border-line/80 dark:border-line/10 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-30 shadow-sm text-slate-400"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="p-2.5 bg-surface border border-line/80 dark:border-line/10 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-30 shadow-sm text-slate-400"
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
