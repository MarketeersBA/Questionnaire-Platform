import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Copy, ExternalLink } from 'lucide-react';
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
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3rem] border border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl transition-colors">
                <div className="p-10 border-b border-slate-100 dark:border-slate-800/50 flex items-center justify-between shrink-0 bg-brand-blue/5 dark:bg-brand-blue/10">
                    <div className="space-y-1 text-left">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
                            <ShieldCheck className="w-4 h-4" />
                            Survey Ready
                        </div>
                        <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white">Survey <span className="text-brand-blue">Links</span></h2>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="px-6 py-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-black uppercase tracking-widest transition-all text-slate-600 dark:text-slate-400 shadow-sm"
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

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Access Key Registry</h4>
                            <ExportActions
                                onExport={handleExport}
                                label="Download List"
                                variant="secondary"
                            />
                        </div>
                        <div className="space-y-3">
                            {successData.generated_tokens?.map((token: string, idx: number) => {
                                const url = getSurveyLink(token);
                                return (
                                    <div key={token} className="group flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:border-brand-blue/20 hover:bg-slate-50 dark:hover:bg-brand-blue/5 transition-all shadow-sm">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-500 dark:text-slate-500 font-mono">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-mono text-slate-500 truncate tracking-tight">{url}</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const fallbackCopy = (text: string) => {
                                                    const textArea = document.createElement("textarea");
                                                    textArea.value = text;
                                                    textArea.style.position = "fixed";
                                                    textArea.style.left = "-9999px";
                                                    textArea.style.top = "-9999px";
                                                    textArea.style.opacity = "0";
                                                    document.body.appendChild(textArea);
                                                    textArea.focus();
                                                    textArea.select();
                                                    try {
                                                        const successful = document.execCommand('copy');
                                                        if (successful) {
                                                            toast.success(`Link ${idx + 1} copied`);
                                                        } else {
                                                            toast.error('Copy failed');
                                                        }
                                                    } catch (err) {
                                                        console.error('Fallback copy failed', err);
                                                    }
                                                    document.body.removeChild(textArea);
                                                };

                                                if (navigator.clipboard && window.isSecureContext) {
                                                    navigator.clipboard.writeText(url)
                                                        .then(() => toast.success(`Link ${idx + 1} copied`))
                                                        .catch(() => fallbackCopy(url));
                                                } else {
                                                    fallbackCopy(url);
                                                }
                                            }}
                                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-brand-blue hover:text-white transition-all text-slate-400 dark:text-slate-500"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <a href={url} target="_blank" rel="noreferrer" className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-brand-cyan hover:text-white transition-all text-slate-400 dark:text-slate-500">
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800/50 flex items-center justify-center gap-4 transition-colors">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest transition-colors">Survey is ready for distribution.</p>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm" />
                </div>
            </div>
        </motion.div>,
        document.body
    );
}
