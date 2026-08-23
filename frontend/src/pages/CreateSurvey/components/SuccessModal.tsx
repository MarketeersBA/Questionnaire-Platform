import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Copy, ExternalLink, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StatCard from './StatCard';
import { toast } from 'sonner';
import { ExportActions } from '../../../components/ExportActions';
import { exportSurveyLinks } from '../../../utils/exportUtils';
import { getSurveyBaseUrl, getSurveyLink } from '../../../utils/surveyLinks';

interface SuccessModalProps {
    successData: any;
}

export function SuccessModal({ successData }: SuccessModalProps) {
    const navigate = useNavigate();

    if (!successData) return null;

    const handleExport = (format: 'csv' | 'txt' | 'json') => {
        if (format === 'json') return; // Not implemented yet
        exportSurveyLinks(
            successData.generated_tokens,
            getSurveyBaseUrl(),
            format,
            successData._id
        );
        toast.success(`Registry exported as ${format.toUpperCase()}`);
    };

    return createPortal(
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md"
        >
            <div className="bg-surface w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3rem] border border-line/80 dark:border-line/10 flex flex-col shadow-2xl transition-colors">
                <div className="p-10 border-b border-line/80 dark:border-line/10 flex items-center justify-between shrink-0 bg-primary/5 dark:bg-primary/10">
                    <div className="space-y-1 text-left">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
                            <ShieldCheck className="w-4 h-4" />
                            Survey Ready
                        </div>
                        <h2 className="text-3xl font-display font-black text-ink">Survey <span className="text-primary-soft">Links</span></h2>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="px-6 py-2 rounded-full bg-surface-sunken hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-black uppercase tracking-widest transition-all text-ink-muted shadow-sm"
                    >
                        Go to Dashboard
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar text-left">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard label="Survey ID" value={successData._id.slice(-8).toUpperCase()} sub="Provisioned ID" />
                        <StatCard label="Link Count" value={successData.generated_tokens?.length || 0} sub="Unique Keys" />
                        <StatCard label="Security" value="One-Time" sub="State Invalidation" />
                    </div>

                    <div className="space-y-4 max-w-2xl mx-auto mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-ink-subtle">Master Distribution Link</h4>
                        </div>
                        
                        <div className="group relative p-8 rounded-3xl bg-surface-raised/50 border border-line/80 dark:border-line/10 hover:border-primary/30 transition-all overflow-hidden shadow-sm">
                            {/* Decorative Background */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-primary/10 transition-colors" />
                            
                            <div className="relative z-10 flex flex-col items-center text-center gap-6">
                                <div className="w-16 h-16 rounded-2xl bg-surface border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-md">
                                    <QrCode className="w-8 h-8 text-primary-soft" />
                                </div>
                                
                                <div>
                                    <h3 className="text-lg font-black text-ink mb-2">Unique Survey Master Link</h3>
                                    <p className="text-xs font-medium text-slate-500 max-w-sm mx-auto">
                                        Distribute this single link to all respondents. The system will automatically handle individual tracking and prevent duplicates.
                                    </p>
                                </div>

                                <div className="w-full flex items-center p-2 rounded-2xl bg-surface border border-line/80 dark:border-line/10 shadow-inner">
                                    <div className="flex-1 px-4 overflow-x-auto no-scrollbar">
                                        <p className="text-sm font-mono text-ink-muted whitespace-nowrap">
                                            {`${getSurveyBaseUrl()}/m/${successData._id}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 pl-2 border-l border-line/80 dark:border-line/10">
                                        <button
                                            onClick={() => {
                                                const url = `${getSurveyBaseUrl()}/m/${successData._id}`;
                                                const fallbackCopy = (text: string) => {
                                                    const textArea = document.createElement("textarea");
                                                    textArea.value = text;
                                                    textArea.style.position = "fixed";
                                                    document.body.appendChild(textArea);
                                                    textArea.focus();
                                                    textArea.select();
                                                    try {
                                                        document.execCommand('copy');
                                                        toast.success('Master Link copied');
                                                    } catch (err) {
                                                        toast.error('Copy failed');
                                                    }
                                                    document.body.removeChild(textArea);
                                                };
                                                if (navigator.clipboard && window.isSecureContext) {
                                                    navigator.clipboard.writeText(url)
                                                        .then(() => toast.success('Master Link copied'))
                                                        .catch(() => fallbackCopy(url));
                                                } else {
                                                    fallbackCopy(url);
                                                }
                                            }}
                                            className="p-3 rounded-xl bg-primary text-white hover:bg-primary-hover hover:-translate-y-0.5 active:scale-95 transition-all shadow-md shadow-primary/20 flex items-center gap-2"
                                        >
                                            <Copy className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Copy</span>
                                        </button>
                                        <a 
                                            href={`${getSurveyBaseUrl()}/m/${successData._id}`}
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="p-3 rounded-xl bg-surface-sunken text-slate-500 hover:text-primary-soft hover:bg-white dark:hover:bg-slate-700 active:scale-95 hover:-translate-y-0.5 transition-all shadow-sm flex items-center"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-surface-raised/50 border-t border-line/80 dark:border-line/10 flex items-center justify-center gap-4 transition-colors">
                    <p className="text-[10px] font-black text-ink-subtle uppercase tracking-widest transition-colors">Survey is ready for distribution.</p>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm" />
                </div>
            </div>
        </motion.div>,
        document.body
    );
}
