import { useState, useEffect } from 'react';
import { Search, X, Loader2, History, ArrowRight, User, Calendar, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { surveys } from '../../../services/api';

interface CloneSurveyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (survey: any) => void;
}

export function CloneSurveyModal({ isOpen, onClose, onSelect }: CloneSurveyModalProps) {
    const [surveyList, setSurveyList] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchSurveys();
        }
    }, [isOpen]);

    const fetchSurveys = async () => {
        setLoading(true);
        try {
            const data = await surveys.list();
            // Filter out deleted ones just in case the API didn't
            setSurveyList(data.filter((s: any) => !s.is_deleted));
        } catch (err) {
            console.error('Failed to fetch surveys for cloning', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredSurveys = surveyList.filter(s => {
        const query = searchQuery.toLowerCase();
        const projectName = (s.company_name || '').toLowerCase();
        const projectCode = (s.survey_code || '').toLowerCase();
        const creator = (s.created_by || s.createdBy || s.user || 'admin').toLowerCase();

        return projectName.includes(query) || projectCode.includes(query) || creator.includes(query);
    });

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-2xl bg-surface rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20 dark:border-slate-800"
                >
                    <div className="p-8 border-b border-line/80 dark:border-line/10 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-primary/10 text-primary-soft">
                                <History size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-display font-black text-ink">Clone from Archive</h3>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Select a historical template to reuse</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="relative group">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-soft transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Search by project name or owner..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-surface-raised border-2 border-line/80 dark:border-line/10 rounded-2xl pl-12 pr-6 py-4 text-ink focus:outline-none focus:border-primary transition-all font-bold"
                            />
                        </div>

                        <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4">
                                    <Loader2 size={32} className="animate-spin text-primary-soft" />
                                    <span className="text-xs font-black uppercase tracking-widest">Scanning Archive...</span>
                                </div>
                            ) : filteredSurveys.length === 0 ? (
                                <div className="text-center py-20 text-slate-400">
                                    <p className="text-sm font-bold">No historical surveys found matching your query.</p>
                                </div>
                            ) : (
                                filteredSurveys.map((survey) => (
                                    <button
                                        key={survey._id}
                                        onClick={() => onSelect(survey)}
                                        className="w-full p-5 rounded-3xl border-2 border-line/80 dark:border-line/10 hover:border-primary dark:hover:border-primary bg-surface hover:shadow-xl hover:shadow-primary/5 transition-all text-left flex items-center justify-between group"
                                    >
                                        <div className="space-y-2 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-ink group-hover:text-primary-soft transition-colors">
                                                    {survey.company_name}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-lg bg-surface-sunken text-[10px] font-black uppercase text-slate-500 border border-slate-200 dark:border-slate-700">
                                                    {survey.type || 'Standard'}
                                                </span>
                                                {survey.survey_code && (
                                                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/10 text-[10px] font-black text-primary-soft border border-primary/20">
                                                        <Tag size={10} />
                                                        {survey.survey_code}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                                <div className="flex items-center gap-1.5">
                                                    <User size={12} className="text-slate-400" />
                                                    {survey.created_by || survey.createdBy || survey.user || 'admin'}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={12} className="text-slate-400" />
                                                    {survey.created_at ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(survey.created_at)) : 'Recently'}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Tag size={12} className="text-slate-400" />
                                                    {survey.link_count || 0} Links
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-10 h-10 rounded-2xl bg-surface-raised flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                                            <ArrowRight size={18} />
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="p-6 bg-surface-raised border-t border-line/80 dark:border-line/10 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Research Ecosystems are cloned with full architectural snapshots
                        </p>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
