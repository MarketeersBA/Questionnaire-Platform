import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { surveys, analytics } from '../services/api';
import {
    FileText,
    Calendar,
    Search,
    Download,
    Eye,
    CheckCircle2,
    BarChart3, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ShareLinkModal from '../components/report/ShareLinkModal';
import ShareStatusStrip from '../components/report/ShareStatusStrip';
import type { ReportShareLink } from '../services/api';

export default function SurveyReports() {
    const navigate = useNavigate();
    const [surveyList, setSurveyList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
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
        fetchSurveys();
    }, []);


    /** Which card is currently minting a link, so its button can disable. */

    /**
     * Copy a client-facing report link.
     *
     * Minting is idempotent server-side, so pressing this repeatedly returns
     * the same URL rather than invalidating one the client already has.
     */
    /**
     * Open the share settings for a report.
     *
     * This replaced a one-click "copy link" button. Copying still happens on
     * create, but the viewer limit and expiry have to be a decision at the
     * moment of sharing rather than a default nobody revisits — an unlimited,
     * never-expiring link handed to a client is not something to fall into by
     * pressing a clipboard icon.
     */
    const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);

    /**
     * Share state per survey, fetched once for the whole grid.
     *
     * Loaded here rather than inside each card so a list of twenty reports does
     * not open twenty connections, and so the strip updates immediately after
     * the editor closes instead of going stale.
     */
    const [sharesBySurvey, setSharesBySurvey] = useState<Record<string, ReportShareLink | null>>({});
    const [sharesLoading, setSharesLoading] = useState(false);

    const loadShares = useCallback(async (surveyIds: string[]) => {
        if (surveyIds.length === 0) return;
        setSharesLoading(true);
        try {
            const results = await Promise.all(
                surveyIds.map(async (id) => {
                    try {
                        return [id, await analytics.peekShareLink(id)] as const;
                    } catch {
                        // One unreadable report must not blank the whole grid.
                        return [id, null] as const;
                    }
                })
            );
            setSharesBySurvey(Object.fromEntries(results));
        } finally {
            setSharesLoading(false);
        }
    }, []);
    useEffect(() => {
        const withResponses = surveyList
            .filter((s) => (s.respondent_count || 0) > 0)
            .map((s) => s._id);
        void loadShares(withResponses);
    }, [surveyList, loadShares]);

    const handleDownload = async (id: string, name: string) => {
        try {
            toast.info(`Downloading PPTX export for ${name}...`);
            await analytics.downloadReport(id);
        } catch {
            toast.error('Report not generated yet. View screen report to start generation.');
        }
    };

    // A report can be generated at any point in fieldwork, so this no longer
    // hides surveys that have not met their target — it only requires at least
    // one response (nothing to report on otherwise). Under-target surveys are
    // still marked, so an interim read is never mistaken for a final one.
    const eligibleSurveys = surveyList.filter(s => {
        const matchesSearch = s.company_name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch && (s.respondent_count || 0) > 0;
    });

    const isTargetMet = (s: any) => {
        const target = s.sample_capacity || s.respondent_target || 0;
        return target > 0 && (s.respondent_count || 0) >= target;
    };

    if (loading) return (
        <div className="space-y-10 pb-20 animate-pulse">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
                <div className="space-y-4 w-full max-w-xl">
                    <div className="h-8 w-40 bg-slate-200/50 dark:bg-slate-800/50 rounded-lg"></div>
                    <div className="h-14 w-64 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl"></div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-[280px] bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-slate-800/20 rounded-[2rem] w-full"></div>
                ))}
            </div>
        </div>
    );

    return (
        <>
        <div className="space-y-10 pb-20">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary-soft border border-primary/10 dark:border-primary/30">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted font-display">
                            Output <span className="text-primary-soft">Center</span>
                        </div>
                    </div>
                    <h1 className="text-5xl font-display font-black tracking-tight leading-none text-ink">
                        Survey Reports
                    </h1>
                    <p className="mt-4 text-slate-800 dark:text-slate-300 max-w-xl font-bold leading-relaxed">
                        Surveys that have met their response targets and are ready for automated reporting generation and presentation exports.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-soft transition-colors" />
                        <input
                            type="text"
                            placeholder="Search reports..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-64 bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-line/80 dark:border-line/10 rounded-2xl pl-12 pr-6 py-4 text-ink font-bold focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/30 transition-all shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Reports Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                    {eligibleSurveys.map((survey: any, idx) => (
                        <motion.div
                            key={survey._id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: idx * 0.04 }}
                            className="bg-blue-50/50 dark:bg-blue-900/20 rounded-[2rem] border border-blue-500/20 dark:border-blue-500/20 p-7 flex flex-col shadow-premium group hover:-translate-y-1 hover:bg-red-50/50 dark:hover:bg-red-900/20 hover:border-red-500/30 dark:hover:border-red-500/30 transition-all duration-300 overflow-hidden"
                        >
                            <div className="flex justify-between items-start gap-3 mb-6">
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div className="w-12 h-12 shrink-0 bg-surface-sunken rounded-2xl flex items-center justify-center border border-slate-300 dark:border-slate-700 group-hover:border-primary/30 group-hover:bg-primary/5 transition-all font-display font-black text-ink-muted group-hover:text-primary-soft text-base">
                                        {survey.company_name.charAt(0)}
                                    </div>
                                    <div className="min-w-0 flex-1 overflow-hidden">
                                        <div
                                            className="font-black text-lg text-ink truncate group-hover:text-primary-soft transition-colors"
                                            title={survey.company_name}
                                        >
                                            {survey.company_name}
                                        </div>
                                        <div className="text-[10px] font-bold text-ink-subtle uppercase tracking-widest flex items-center gap-2 mt-1">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(survey.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="shrink-0 bg-emerald-500/10 text-emerald-500 p-2 rounded-xl flex items-center justify-center" title="Target Met">
                                    <CheckCircle2 strokeWidth={2.5} size={20} />
                                </div>
                            </div>

                            <div className="bg-surface-raised/50 rounded-2xl p-4 mb-6 border border-line/80 dark:border-line/10">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">Response Quota</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-ink leading-none">{survey.respondent_count}</span>
                                        <span className="text-sm font-bold text-slate-400">/ {survey.sample_capacity || survey.respondent_target}</span>
                                    </div>
                                </div>
                                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full w-full"></div>
                                </div>
                            </div>

                            <div className="mt-auto">
                                <ShareStatusStrip
                                    share={sharesBySurvey[survey._id]}
                                    loading={sharesLoading && !sharesBySurvey[survey._id]}
                                    onManage={() =>
                                        setShareTarget({ id: survey._id, name: survey.company_name })
                                    }
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => navigate(`/surveys/${survey._id}/report`)}
                                    className="flex-1 bg-primary/10 dark:bg-primary/10 text-primary-soft dark:text-brand-cyan hover:bg-primary hover:text-white py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all border border-primary/20 dark:border-primary/30"
                                >
                                    <Eye size={16} /> {isTargetMet(survey) ? 'Screen Report' : 'Interim Report'}
                                </button>
                                <button
                                    onClick={() =>
                                        setShareTarget({ id: survey._id, name: survey.company_name })
                                    }
                                    className="p-3.5 rounded-xl bg-surface-raised text-ink-muted hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 hover:text-primary-soft"
                                    title="Share this report — set a viewer limit and expiry"
                                >
                                    <Share2 size={18} />
                                </button>
                                <button
                                    onClick={() => handleDownload(survey._id, survey.company_name)}
                                    className="p-3.5 rounded-xl bg-surface-raised text-ink-muted hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 hover:text-primary-soft"
                                    title="Export PPTX"
                                >
                                    <Download size={18} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {eligibleSurveys.length === 0 && (
                    <div className="col-span-full py-24 text-center border-2 border-dashed border-line/80 dark:border-line/10 rounded-[3rem]">
                        <div className="w-20 h-20 mx-auto bg-surface-raised rounded-full flex items-center justify-center mb-6">
                            <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-xl font-display font-black text-ink mb-2">No Reports Available</h3>
                        <p className="text-ink-muted font-medium max-w-md mx-auto">
                            {searchQuery ? 'Try adjusting your search filters.' : 'There are no surveys that have successfully met their required response targets yet.'}
                        </p>
                    </div>
                )}
            </div>
        </div>

            {shareTarget && (
                <ShareLinkModal
                    surveyId={shareTarget.id}
                    surveyName={shareTarget.name}
                    isOpen
                    onClose={() => {
                        const id = shareTarget.id;
                        setShareTarget(null);
                        void loadShares([id]);
                    }}
                />
            )}
        </>
    );
}
