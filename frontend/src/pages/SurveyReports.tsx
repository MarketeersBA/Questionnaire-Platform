import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { surveys, analytics } from '../services/api';
import {
    FileText,
    Calendar,
    Search,
    Download,
    Eye,
    CheckCircle2,
    BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

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

    const handleDownload = async (id: string, name: string) => {
        try {
            toast.info(`Downloading PPTX export for ${name}...`);
            await analytics.downloadReport(id);
        } catch {
            toast.error('Report not generated yet. View screen report to start generation.');
        }
    };

    // Filter to surveys matching responses vs target.
    const eligibleSurveys = surveyList.filter(s => {
        const matchesSearch = s.company_name.toLowerCase().includes(searchQuery.toLowerCase());
        const target = s.sample_capacity || s.respondent_target || 0;
        const targetMet = target > 0 && s.respondent_count >= target;
        return matchesSearch && targetMet;
    });

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
        <div className="space-y-10 pb-20">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-500 border border-orange-500/10 dark:border-orange-500/30">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300 font-display">
                            Output <span className="text-orange-500">Center</span>
                        </div>
                    </div>
                    <h1 className="text-5xl font-display font-black tracking-tight leading-none text-slate-900 dark:text-white">
                        Survey Reports
                    </h1>
                    <p className="mt-4 text-slate-800 dark:text-slate-300 max-w-xl font-bold leading-relaxed">
                        Surveys that have met their response targets and are ready for automated reporting generation and presentation exports.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search reports..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-64 bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-4 text-slate-900 dark:text-white font-bold focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/30 transition-all shadow-sm"
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
                            className="bg-white dark:bg-slate-900/50 rounded-[2rem] border border-slate-100 dark:border-slate-800/50 p-7 flex flex-col shadow-premium group hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                        >
                            <div className="flex justify-between items-start gap-3 mb-6">
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div className="w-12 h-12 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-300 dark:border-slate-700 group-hover:border-orange-500/30 group-hover:bg-orange-500/5 transition-all font-display font-black text-slate-600 dark:text-slate-400 group-hover:text-orange-500 text-base">
                                        {survey.company_name.charAt(0)}
                                    </div>
                                    <div className="min-w-0 flex-1 overflow-hidden">
                                        <div
                                            className="font-black text-lg text-slate-900 dark:text-white truncate group-hover:text-orange-500 transition-colors"
                                            title={survey.company_name}
                                        >
                                            {survey.company_name}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 mt-1">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(survey.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="shrink-0 bg-emerald-500/10 text-emerald-500 p-2 rounded-xl flex items-center justify-center" title="Target Met">
                                    <CheckCircle2 strokeWidth={2.5} size={20} />
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 mb-6 border border-slate-100 dark:border-slate-800">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Response Quota</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{survey.respondent_count}</span>
                                        <span className="text-sm font-bold text-slate-400">/ {survey.sample_capacity || survey.respondent_target}</span>
                                    </div>
                                </div>
                                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full w-full"></div>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-auto">
                                <button
                                    onClick={() => navigate(`/surveys/${survey._id}/report`)}
                                    className="flex-1 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500 hover:text-white py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all border border-orange-200 dark:border-orange-500/30"
                                >
                                    <Eye size={16} /> Screen Report
                                </button>
                                <button
                                    onClick={() => handleDownload(survey._id, survey.company_name)}
                                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 hover:text-brand-blue"
                                    title="Export PPTX"
                                >
                                    <Download size={18} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {eligibleSurveys.length === 0 && (
                    <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem]">
                        <div className="w-20 h-20 mx-auto bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                            <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-xl font-display font-black text-slate-900 dark:text-white mb-2">No Reports Available</h3>
                        <p className="text-slate-500 dark:text-slate-400 font-medium max-w-md mx-auto">
                            {searchQuery ? 'Try adjusting your search filters.' : 'There are no surveys that have successfully met their required response targets yet.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
