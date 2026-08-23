import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tokens, surveys } from '../services/api';
import {
    Plus,
    Filter,
    CheckCircle2,
    ChevronRight,
    ArrowLeft,
    Activity,
    Zap,
    Clock,
    ShieldAlert,
    ExternalLink,
    ChevronLeft,
    Database,
    Copy,
    Link as LinkIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ExportActions } from '../components/ExportActions';
import { exportTokens } from '../utils/exportUtils';
import { getSurveyBaseUrl, getSurveyLink, getMasterLink } from '../utils/surveyLinks';

export default function TokenManagement() {
    const { surveyId } = useParams();
    const [survey, setSurvey] = useState<any>(null);
    const [summary, setSummary] = useState({ unused: 0, passed: 0, failed: 0, submitted: 0, total: 0 });
    const [tokenList, setTokenList] = useState<any[]>([]);
    const [totalTokens, setTotalTokens] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
    const [genCount, setGenCount] = useState(10);
    const [loading, setLoading] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const fetchData = async () => {
        if (!surveyId) return;
        setLoading(true);
        try {
            const [sData, sumData, tData] = await Promise.all([
                surveys.get(surveyId),
                tokens.getSummary(surveyId),
                tokens.listBySurvey(surveyId, {
                    status: statusFilter || undefined,
                    page,
                    page_size: 20
                })
            ]);
            setSurvey(sData);
            setSummary(sumData);
            setTokenList(tData.items || []);
            setTotalTokens(tData.total || 0);
        } catch (err) {
            console.error(err);
            toast.error('Failed to sync token repository');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        setSelectedTokens([]);
    }, [surveyId, statusFilter, page]);

    const handleGenerate = async () => {
        if (!surveyId) return;
        setLoading(true);
        try {
            await tokens.generate(surveyId, genCount);
            toast.success(`Allocated ${genCount} secure tokens`);
            fetchData();
        } finally {
            setLoading(false);
        }
    };

    const copyMasterLink = (id: string) => {
        const url = getMasterLink(id);
        const notifySuccess = () => toast.success('Master link copied to clipboard');
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(url).then(notifySuccess).catch(() => fallbackCopy(url));
        } else {
            fallbackCopy(url);
        }
    };

    const copyToClipboard = (token: string) => {
        const url = getSurveyLink(token);

        const notifySuccess = (isFallback = false) => {
            toast.success(`Access link copied to clipboard ${isFallback ? '(fallback)' : ''}`);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(url)
                .then(() => notifySuccess())
                .catch(() => fallbackCopy(url));
        } else {
            fallbackCopy(url);
        }
    };

    const fallbackCopy = (text: string) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Ensure it's not visible but exists in DOM for selection
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
                toast.success('Access link copied to clipboard');
            } else {
                toast.error('Unable to copy. Please copy manually.');
            }
        } catch (err) {
            toast.error('Browser blocked clipboard access');
            console.error('Fallback copy failed:', err);
        }

        document.body.removeChild(textArea);
    };

    const handleBulkInvalidate = async () => {
        if (selectedTokens.length === 0) return;
        if (!confirm(`Are you sure you want to invalidate ${selectedTokens.length} active sessions?`)) return;

        setBulkLoading(true);
        try {
            await tokens.bulkUpdate({
                token_ids: selectedTokens,
                status: 'failed'
            });
            toast.warning(`${selectedTokens.length} entries restricted`);
            fetchData();
            setSelectedTokens([]);
        } catch (err) {
            console.error(err);
        } finally {
            setBulkLoading(false);
        }
    };

    const handleBulkExport = async (format: 'csv' | 'txt' | 'json' | 'pptx') => {
        if (!surveyId || format === 'json' || format === 'pptx') return;
        setIsExporting(true);
        try {
            let dataToExport = [];
            if (selectedTokens.length > 0) {
                // Export only selected (from current page)
                dataToExport = tokenList.filter(t => selectedTokens.includes(t._id));
            } else {
                // Export ALL matching current filter
                const allData = await tokens.listBySurvey(surveyId, {
                    status: statusFilter || undefined,
                    page: 1,
                    page_size: 1000 // A reasonably large cap for export
                });
                dataToExport = allData.items || [];
            }

            if (dataToExport.length === 0) {
                toast.error('No tokens found to export');
                return;
            }

            exportTokens(
                dataToExport,
                getSurveyBaseUrl(),
                format,
                survey.company_name
            );
            toast.success(`Successfully exported ${dataToExport.length} tokens`);
        } catch (err) {
            console.error(err);
            toast.error('Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    const toggleTokenSelection = (id: string) => {
        setSelectedTokens(prev =>
            prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedTokens.length === tokenList.length && tokenList.length > 0) {
            setSelectedTokens([]);
        } else {
            setSelectedTokens(tokenList.map(t => t._id));
        }
    };

    if (!survey) return (
        <div className="h-[60vh] flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-t-brand-accent border-white/10 animate-spin"></div>
        </div>
    );

    return (
        <div className="space-y-10">
            {/* Premium Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 text-left">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Link to="/dashboard" className="p-2 rounded-xl bg-surface-sunken hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-ink-muted">
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-subtle">
                            Access <span className="text-primary-soft">Repository</span>
                        </div>
                    </div>
                    <h1 className="text-4xl font-display font-black text-ink tracking-tight transition-colors">
                        Token <span className="text-slate-400 font-light">Management</span>
                    </h1>
                    <p className="text-ink-muted font-medium">Monitoring distribution for <span className="text-ink font-black">{survey.company_name}</span></p>
                </div>

                <div className="flex items-center gap-6">
                    <div className="bg-surface flex items-center gap-4 px-8 py-4 rounded-[2rem] border border-line/80 dark:border-line/10 shadow-xl transition-colors">
                        <div>
                            <p className="text-[10px] font-black text-ink-subtle uppercase tracking-widest leading-none mb-1">Total Pool</p>
                            <p className="text-2xl font-display font-black text-ink">{summary.total}</p>
                        </div>
                        <div className="w-px h-10 bg-surface-sunken"></div>
                        <div>
                            <p className="text-[10px] font-black text-ink-subtle uppercase tracking-widest leading-none mb-1">Active</p>
                            <p className="text-2xl font-display font-black text-primary-soft">{summary.unused}</p>
                        </div>
                    </div>

                    <ExportActions
                        onExport={handleBulkExport}
                        isLoading={isExporting}
                        label="Export Registry"
                        variant="primary"
                    />
                </div>
            </div>

            {/* Master Link Banner */}
            {surveyId && (
                <div className="bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-[2rem] border border-primary/15 dark:border-primary/25 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-primary/10 dark:bg-primary/20 border border-primary/20 text-primary-soft shrink-0">
                            <LinkIcon className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary-soft mb-1">Master Link</p>
                            <code className="text-sm font-mono font-bold text-ink-muted break-all">
                                {getMasterLink(surveyId)}
                            </code>
                            <p className="text-[10px] font-bold text-ink-subtle mt-1 uppercase tracking-wider">
                                Generates a unique session for every respondent who opens this link
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => copyMasterLink(surveyId)}
                        className="shrink-0 flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-primary/90 active:scale-95 transition-all shadow-lg shadow-primary/20"
                    >
                        <Copy className="w-4 h-4" />
                        Copy Master Link
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left: Controls */}
                <div className="space-y-6 text-left">
                    <div className="bg-surface rounded-[2.5rem] p-8 border border-line/80 dark:border-line/10 shadow-xl transition-colors">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2.5 rounded-xl bg-primary/5 dark:bg-primary/10 text-primary-soft border border-primary/10">
                                <Zap className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-display font-black text-ink">Bulk <span className="text-primary-soft">Allocation</span></h3>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-subtle ml-1">Distribution size</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="500"
                                    className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-ink focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all font-bold shadow-inner"
                                    value={genCount}
                                    onChange={(e) => setGenCount(parseInt(e.target.value))}
                                />
                            </div>
                            <button
                                onClick={handleGenerate}
                                disabled={loading}
                                className="w-full py-4 bg-primary text-white rounded-2xl flex items-center justify-center gap-2 group shadow-xl hover:shadow-primary/20 transition-all font-black tracking-wide text-xs uppercase tracking-widest"
                            >
                                {loading ? <Clock className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" /> Provision Tokens</>}
                            </button>
                            <p className="text-[10px] text-ink-subtle text-center font-bold px-4 leading-relaxed uppercase tracking-tighter">
                                Each token is cryptographically secure and strictly single-use.
                            </p>
                        </div>
                    </div>

                    <div className="bg-surface rounded-[2rem] p-8 border border-line/80 dark:border-line/10 shadow-xl transition-colors text-left">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-ink-subtle mb-6">Frictionless Lifecycle</h4>
                        <div className="space-y-5">
                            <LifecycleItem icon={Plus} label="Allocated" value={summary.total} color="slate" />
                            <LifecycleItem icon={Clock} label="Pending" value={summary.unused} color="blue" />
                            <LifecycleItem icon={CheckCircle2} label="Qualified" value={summary.passed} color="emerald" />
                            <LifecycleItem icon={ShieldAlert} label="Restricted" value={summary.failed} color="red" />
                            <LifecycleItem icon={ExternalLink} label="Finalized" value={summary.submitted} color="cyan" />
                        </div>
                    </div>
                </div>

                {/* Right: Data Table */}
                <div className="lg:col-span-3 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
                        <div className="flex items-center gap-3">
                            <div className="relative group">
                                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                <select
                                    className="pl-9 pr-8 py-2.5 bg-surface border border-line/80 dark:border-line/10 rounded-xl text-xs font-black uppercase tracking-widest focus:outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer shadow-sm text-ink-muted"
                                    value={statusFilter}
                                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                >
                                    <option value="">Status Filter</option>
                                    <option value="unused">Active / Pending</option>
                                    <option value="passed">Qualified</option>
                                    <option value="failed">Restricted</option>
                                    <option value="submitted">Finalized</option>
                                </select>
                                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none rotate-90" />
                            </div>

                            <AnimatePresence>
                                {selectedTokens.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <motion.button
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            onClick={handleBulkInvalidate}
                                            disabled={bulkLoading}
                                            className="bg-accent/5 border border-accent/10 text-accent-soft px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-accent/10 transition-all flex items-center gap-2 shadow-sm"
                                        >
                                            <ShieldAlert className="w-4 h-4" />
                                            Restrict ({selectedTokens.length})
                                        </motion.button>

                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                        >
                                            <ExportActions
                                                onExport={handleBulkExport}
                                                isLoading={isExporting}
                                                label={`Export (${selectedTokens.length})`}
                                                variant="secondary"
                                            />
                                        </motion.div>
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest bg-surface-sunken px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
                                Slice {page} <span className="text-slate-300 dark:text-slate-600">of</span> {Math.ceil(totalTokens / 20) || 1}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-2.5 bg-surface border border-line/80 dark:border-line/10 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-30 shadow-sm text-slate-400"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={page >= Math.ceil(totalTokens / 20)}
                                    className="p-2.5 bg-surface border border-line/80 dark:border-line/10 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-30 shadow-sm text-slate-400"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-surface rounded-[2.5rem] border border-line/80 dark:border-line/10 overflow-hidden relative shadow-xl text-left transition-colors">
                        <AnimatePresence>
                            {loading && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50"
                                >
                                    <div className="w-12 h-12 rounded-full border-4 border-line/80 dark:border-line/10 border-t-brand-blue animate-spin shadow-inner"></div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b border-line/80 dark:border-line/10 bg-slate-50/50 dark:bg-slate-800/50">
                                        <th className="px-8 py-6 text-left w-10">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded-lg border-slate-200 dark:border-slate-700 bg-surface text-primary-soft focus:ring-primary/20 transition-all cursor-pointer shadow-sm"
                                                checked={selectedTokens.length > 0 && selectedTokens.length === tokenList.length}
                                                onChange={toggleSelectAll}
                                            />
                                        </th>
                                        <th className="px-8 py-6 text-left text-[10px] font-black uppercase tracking-widest text-ink-subtle">Security String</th>
                                        <th className="px-8 py-6 text-left text-[10px] font-black uppercase tracking-widest text-ink-subtle">Audit Node</th>
                                        <th className="px-8 py-6 text-left text-[10px] font-black uppercase tracking-widest text-ink-subtle">Status</th>
                                        <th className="px-8 py-6 text-right text-[10px] font-black uppercase tracking-widest text-ink-subtle">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {tokenList.map((t: any, idx) => (
                                        <motion.tr
                                            key={t._id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.02 }}
                                            className={`group transition-all hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedTokens.includes(t._id) ? 'bg-primary/5' : ''}`}
                                        >
                                            <td className="px-8 py-5">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded-lg border-slate-200 dark:border-slate-700 bg-surface text-primary-soft focus:ring-primary/20 transition-all cursor-pointer shadow-sm"
                                                    checked={selectedTokens.includes(t._id)}
                                                    onChange={() => toggleTokenSelection(t._id)}
                                                />
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-surface-sunken text-ink-subtle group-hover:text-primary-soft group-hover:bg-primary/5 border border-transparent group-hover:border-primary/10 transition-all shadow-sm">
                                                        <Database className="w-4 h-4" />
                                                    </div>
                                                    <code className="text-xs font-mono font-black text-ink-muted tracking-tight group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                                        {t.token.slice(0, 16)}<span className="text-slate-300 dark:text-slate-600">...</span>
                                                    </code>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="text-[10px] font-black text-ink-subtle font-mono tracking-tighter uppercase bg-surface-sunken px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 transition-colors">
                                                    {t.batch_id.slice(0, 12)}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <StatusBadge status={t.status} />
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <button
                                                    onClick={() => copyToClipboard(t.token)}
                                                    className="p-2.5 rounded-xl bg-surface-raised hover:bg-primary text-slate-400 hover:text-white transition-all group/btn border border-slate-100 dark:border-slate-700 shadow-sm"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))}
                                    {tokenList.length === 0 && !loading && (
                                        <tr>
                                            <td colSpan={5} className="px-8 py-24 text-center">
                                                <div className="flex flex-col items-center gap-6">
                                                    <div className="p-10 rounded-[2.5rem] bg-surface-raised border border-slate-100 dark:border-slate-700 shadow-inner text-slate-200 dark:text-slate-700 transition-colors">
                                                        <Activity className="w-16 h-16" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xl font-display font-black text-ink-subtle">Repository Empty</p>
                                                        <p className="text-[10px] text-slate-300 dark:text-slate-600 font-black uppercase tracking-widest mt-2">No matches found for current filter</p>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LifecycleItem({ icon: Icon, label, value, color }: any) {
    const colors: any = {
        blue: 'text-primary-soft',
        emerald: 'text-emerald-600 dark:text-emerald-400',
        red: 'text-accent-soft',
        cyan: 'text-brand-cyan dark:text-brand-cyan',
        slate: 'text-ink-subtle'
    };

    const bgColors: any = {
        blue: 'bg-primary/5 border-primary/10 dark:bg-primary/10',
        emerald: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20',
        red: 'bg-accent/5 dark:bg-accent/10 border-accent/10',
        cyan: 'bg-brand-cyan/5 dark:bg-brand-cyan/10 border-brand-cyan/10',
        slate: 'bg-surface-raised border-slate-100 dark:border-slate-700'
    };

    return (
        <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border transition-all group-hover:scale-110 ${bgColors[color]} ${colors[color]}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-ink-subtle">{label}</span>
            </div>
            <span className={`text-sm font-display font-black group-hover:translate-x-[-4px] transition-all ${colors[color]}`}>{value}</span>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: any = {
        unused: 'text-primary-soft bg-primary/5 border-primary/10',
        passed: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20',
        failed: 'text-accent-soft bg-accent/5 border-accent/10',
        submitted: 'text-brand-cyan bg-brand-cyan/5 border-brand-cyan/10',
    };

    return (
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${styles[status] || styles.unused}`}>
            {status}
        </span>
    );
}
