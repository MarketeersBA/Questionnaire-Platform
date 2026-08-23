import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { responses } from '../services/api';
import {
    ArrowLeft, Search, Users, CheckCircle2, XCircle, Clock, AlertTriangle,
    Eye, ShieldCheck, ShieldX, Link2, ChevronRight, Phone,
    MapPin, User, Calendar, Activity, RefreshCw, Hash, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import VoiceFeedbackPlayer from '../components/voice-feedback/VoiceFeedbackPlayer';
import { Ban, RotateCcw } from 'lucide-react';
import { buildQuestionLabelMap, collectModuleAnswerSections, resolveAnswerLabel } from '../utils/moduleAnswerLabels';
import { extractProductTestFlatEvaluations } from '../utils/productTestAnalytics';
import PackagingHeatmapAggregateViewer from '../components/PackagingHeatmapAggregateViewer';
import PackagingHeatmapRespondentMini, { isPackagingHeatmapAnswer } from '../components/PackagingHeatmapRespondentMini';
import ProductTestTrialMediaReview, { isProductTestTrialMediaAnswer } from '../components/ProductTestTrialMediaReview';

function ExclusionModal({ isOpen, onClose, onConfirm, currentReason = '' }: any) {
    const [reason, setReason] = useState(currentReason);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-surface rounded-[2.5rem] border border-line/80 dark:border-line/10 shadow-2xl p-8 max-w-md w-full"
            >
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-display font-black text-ink">Flag for Removal</h3>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Response Quality Control</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Exclusion Reason</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g., Short duration, gibberish audio, duplicate respondent..."
                            className="w-full bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500/50 outline-none h-32 resize-none transition-all"
                        />
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-900/30 flex gap-3 text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={16} className="shrink-0" />
                        <p className="text-[10px] font-bold leading-relaxed italic">
                            Excluded responses are removed from the verified completion count and the final report. Data is not permanently deleted.
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-3 rounded-2xl bg-surface-sunken text-ink-muted font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={!reason.trim()}
                        onClick={() => onConfirm(reason)}
                        className="flex-1 px-6 py-3 rounded-2xl bg-rose-500 text-white font-black text-xs uppercase tracking-widest hover:bg-rose-600 shadow-lg shadow-rose-500/20 disabled:opacity-40 transition-all active:scale-95"
                    >
                        Flag Content
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

function RenderAnswerValue({ value, questionMap, labelMap, surveyId }: { value: any; questionMap?: Record<string, any>; labelMap?: Record<string, string>; surveyId?: string }) {
    if (value === null || value === undefined) return <span>—</span>;

    if (isPackagingHeatmapAnswer(value) && surveyId) {
        return <PackagingHeatmapRespondentMini surveyId={surveyId} answer={value} />;
    }

    if (isProductTestTrialMediaAnswer(value) && surveyId) {
        return <ProductTestTrialMediaReview surveyId={surveyId} value={value} />;
    }

    // Handle Voice Feedback
    if (typeof value === 'string') {
        const voiceMatch = value.match(/^\[voice:([a-f0-9]{24})\]$/);
        if (voiceMatch) return <VoiceFeedbackPlayer feedbackId={voiceMatch[1]} />;
        return <span>{value}</span>;
    }

    // Handle Objects (Grid or Loop)
    if (typeof value === 'object') {
        // Handle Simple Array (MCQ)
        if (Array.isArray(value)) {
            return (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((v, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-lg bg-surface-sunken text-[10px] font-bold text-ink-muted border border-slate-200 dark:border-slate-700">
                            {typeof v === 'object' && v && 'otherText' in v ? (v as any).otherText : String(v)}
                        </span>
                    ))}
                </div>
            );
        }

        // Handle Brand Analyzer Grid or Loop (Record<string, any>)
        const entries = Object.entries(value);
        if (entries.length > 0) {
            return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {entries.map(([key, val]) => {
                        // Try to resolve the label for the key (Attribute ID or Brand Name)
                        const rawLabel = questionMap?.[key]?.text || questionMap?.[key]?.label || labelMap?.[key] || key;
                        const label = String(rawLabel).replace(/_/g, ' ');

                        return (
                            <div key={key} className="p-3 bg-surface shadow-sm rounded-2xl border border-line/80 dark:border-line/10 hover:border-primary/30 transition-colors">
                                <div className="text-[9px] font-black uppercase tracking-widest text-primary-soft mb-2 truncate" title={label}>{label}</div>

                                {Array.isArray(val) ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {val.map((b, bi) => (
                                            <span key={bi} className="px-2 py-0.5 rounded-lg bg-surface-raised text-[10px] font-bold text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700">
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                ) : typeof val === 'number' ? (
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary"
                                                style={{ width: `${(val / 5) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-black text-primary-soft">{val}/5</span>
                                    </div>
                                ) : (
                                    <div className="text-xs font-bold text-ink">
                                        {typeof val === 'object' && val ? JSON.stringify(val) : String(val)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        return <pre className="text-[10px] font-mono opacity-60">{JSON.stringify(value, null, 2)}</pre>;
    }

    return <span>{String(value)}</span>;
}

const LIFECYCLE_CONFIG = {
    verified_complete: {
        label: 'Verified Complete',
        shortLabel: 'Complete',
        color: 'emerald',
        icon: CheckCircle2,
        bgClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        dotClass: 'bg-emerald-500',
    },
    verified_incomplete: {
        label: 'Verified Incomplete',
        shortLabel: 'Incomplete',
        color: 'amber',
        icon: AlertTriangle,
        bgClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        dotClass: 'bg-amber-500',
    },
    rejected: {
        label: 'Rejected',
        shortLabel: 'Rejected',
        color: 'rose',
        icon: XCircle,
        bgClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        dotClass: 'bg-rose-500',
    },
    pending: {
        label: 'Pending',
        shortLabel: 'Pending',
        color: 'slate',
        icon: Clock,
        bgClass: 'bg-slate-500/10 text-ink-muted border-slate-500/20',
        dotClass: 'bg-slate-400',
    },
    excluded: {
        label: 'Excluded (Low Quality)',
        shortLabel: 'Excluded',
        color: 'slate',
        icon: AlertTriangle,
        bgClass: 'bg-slate-500/10 text-ink-subtle border-slate-500/20 grayscale',
        dotClass: 'bg-slate-300',
    }
} as const;

type LifecycleState = keyof typeof LIFECYCLE_CONFIG;

function LifecycleBadge({ state }: { state: LifecycleState }) {
    const cfg = LIFECYCLE_CONFIG[state] || LIFECYCLE_CONFIG.pending;
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${cfg.bgClass}`}>
            <Icon size={12} />
            {cfg.shortLabel}
        </span>
    );
}

function StatCard({ icon: Icon, label, value, color, subtext }: any) {
    const colorMap: Record<string, string> = {
        emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
        amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400',
        rose: 'from-rose-500/10 to-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-400',
        slate: 'from-slate-500/10 to-slate-500/5 border-slate-500/20 text-ink-muted',
        blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-400',
    };
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gradient-to-br ${colorMap[color] || colorMap.slate} border rounded-3xl p-6 relative overflow-hidden transition-colors`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-white/50 dark:border-slate-700/50`}>
                    <Icon size={18} />
                </div>
                {subtext && <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{subtext}</span>}
            </div>
            <div className="text-3xl font-display font-black tracking-tight">{value}</div>
            <div className="text-[10px] font-black uppercase tracking-[0.15em] mt-1 opacity-70">{label}</div>
        </motion.div>
    );
}

function TimelineEvent({ event, timestamp, icon, isLast }: any) {
    const iconMap: Record<string, any> = {
        'link': Link2,
        'eye': Eye,
        'shield-check': ShieldCheck,
        'shield-x': ShieldX,
        'check-circle': CheckCircle2,
        'alert-triangle': AlertTriangle,
    };
    const Icon = iconMap[icon] || Activity;
    return (
        <div className="flex gap-4">
            <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary-soft border border-primary/20">
                    <Icon size={14} />
                </div>
                {!isLast && <div className="w-[2px] flex-1 bg-slate-200 dark:bg-slate-700 my-1 rounded-full" />}
            </div>
            <div className="pb-6">
                <div className="font-black text-sm text-ink">{event}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    {timestamp ? new Date(timestamp).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    }) : '—'}
                </div>
            </div>
        </div>
    );
}

function AnswerSection({ title, answers, emptyMessage }: { title: string; answers: Record<string, any>; emptyMessage?: string }) {
    if (!answers || Object.keys(answers).length === 0) {
        return emptyMessage ? (
            <div className="p-6 bg-surface-raised/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                <p className="text-xs font-bold text-slate-500 italic">{emptyMessage}</p>
            </div>
        ) : null;
    }

    // Filter out internal fields
    const displayAnswers = Object.entries(answers).filter(([k]) =>
        !k.startsWith('calculated_') && k !== 'questionMeta'
    );

    return (
        <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">{title}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {displayAnswers.map(([key, value]) => (
                    <div key={key} className="bg-surface/80 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/50 hover:border-primary/30 transition-colors">
                        <div className="text-[9px] font-black uppercase tracking-widest text-ink-muted mb-1.5 truncate" title={key}>
                            {key.replace(/_/g, ' ')}
                        </div>
                        <div className="text-sm font-bold text-ink break-words whitespace-pre-wrap">
                            <RenderAnswerValue value={value} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NestedCollapsible({ title, level = 1, defaultOpen = false, children, badge }: any) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    // Level 1: Brand/Main Category
    // Level 2: Attribute/Sub Category
    // Level 3: Question

    let baseClasses = "";
    let headerClasses = "";
    let titleClasses = "";
    let contentClasses = "";

    if (level === 1) {
        baseClasses = "bg-surface/80 rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-sm overflow-hidden mb-4";
        headerClasses = "p-4 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50";
        titleClasses = "text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200";
        contentClasses = "p-4 space-y-3 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/30 dark:bg-slate-800/30";
    } else if (level === 2) {
        baseClasses = "bg-surface/60 rounded-xl border border-line/80 dark:border-line/10 overflow-hidden";
        headerClasses = "p-3 hover:bg-slate-50 dark:hover:bg-slate-800/80";
        titleClasses = "text-[10px] font-black uppercase tracking-widest text-primary-soft dark:text-blue-400";
        contentClasses = "p-3 pt-0 space-y-2";
    } else {
        // Level 3
        baseClasses = "bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-700/40 overflow-hidden";
        headerClasses = "p-3 hover:bg-slate-100/80 dark:hover:bg-slate-700/60";
        titleClasses = "text-xs font-bold text-ink-muted";
        contentClasses = "p-3 pt-0";
    }

    return (
        <div className={`transition-colors ${baseClasses}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between text-left transition-colors ${headerClasses}`}
            >
                <div className="flex items-start sm:items-center gap-3 pr-4">
                    {level === 3 && <span className="text-primary-soft font-black shrink-0 mt-0.5 sm:mt-0">Q:</span>}
                    <h5 className={titleClasses}>{title}</h5>
                    {badge && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[9px] font-black uppercase tracking-widest text-ink-muted">
                            {badge}
                        </span>
                    )}
                </div>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} className="shrink-0">
                    <ChevronDown size={level === 3 ? 14 : 16} className={level === 1 ? "text-slate-500" : "text-slate-400"} />
                </motion.div>
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className={contentClasses}>
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function Layer2AnswerSection({ title, answers, emptyMessage, moduleSnapshots, surveyId }: any) {
    if (!answers || Object.keys(answers).length === 0) {
        return emptyMessage ? (
            <div className="p-6 bg-surface-raised/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                <p className="text-xs font-bold text-slate-500 italic">{emptyMessage}</p>
            </div>
        ) : null;
    }

    const structuredBlock = answers.__structured || answers.structured;
    const questionMap = answers.question_map || structuredBlock?.question_map || {};

    // Legacy aw_/pb_ keys merged into answers for module section collector
    const legacyPf: Record<string, unknown> = {};
    Object.entries(answers).forEach(([k, v]) => {
        if (k.startsWith('aw_') || k.startsWith('pb_') || k.startsWith('pf_')) {
            legacyPf[k] = v;
        }
    });
    const answersWithLegacy = Object.keys(legacyPf).length
        ? { ...answers, __structured: { ...(structuredBlock || {}), purchase_funnel: { ...(structuredBlock?.purchase_funnel || {}), ...legacyPf } } }
        : answers;

    // 2. Resolve Evaluations
    let evals = answers.flat_evaluations || structuredBlock?.flat_evaluations;

    const productTestEvals = extractProductTestFlatEvaluations(answers);
    if (productTestEvals.length) {
        evals = [...(evals || []), ...productTestEvals];
    }

    // Legacy fallback: if flat_evaluations is missing, build it from _evaluations
    if (!evals && structuredBlock && structuredBlock._evaluations) {
        evals = [];
        const srEvals = structuredBlock._evaluations;
        const processBrands = (brandMap: any) => {
            if (!brandMap) return;
            Object.entries(brandMap).forEach(([brandName, brandData]: any) => {
                if (brandName === 'preference') return; // Note: preference usually in competitors.overall/preference
                if (typeof brandData !== 'object' || !brandData) return;
                Object.entries(brandData).forEach(([qId, val]) => {
                    const qMeta = questionMap[qId] || {};
                    evals.push({
                        brand: brandName,
                        attribute: qMeta.attribute || 'General',
                        metric: qMeta.text || qId,
                        value: val,
                        question_id: qId
                    });
                });
            });
        };
        processBrands(srEvals.internal);
        processBrands(srEvals.competitors);
    }

    // Group evaluations by Brand -> Attribute
    const groupedEvals: Record<string, Record<string, any[]>> = {};
    const brandGroups: Record<string, string> = {};
    if (evals && Array.isArray(evals)) {
        evals.forEach(ev => {
            // For legacy arrays, metric is already parsed. For others, attempt to match question text.
            const metricText = (questionMap[ev.question_id]?.text) || ev.question_text || ev.metric || 'Question';
            const brand = ev.brand || (ev.module === 'packaging_heatmap' ? 'Packaging Heatmap' : 'General');
            const attr = ev.attribute || ev.section_title || (ev.module === 'packaging_heatmap' ? ev.intent || 'Heatmap' : 'General');
            if (ev.group) brandGroups[brand] = ev.group;

            if (!groupedEvals[brand]) groupedEvals[brand] = {};
            if (!groupedEvals[brand][attr]) groupedEvals[brand][attr] = [];
            groupedEvals[brand][attr].push({ ...ev, metric: metricText });
        });
    }

    const labelMap = buildQuestionLabelMap(moduleSnapshots);
    const moduleSections = collectModuleAnswerSections(answersWithLegacy, labelMap);

    // 3. Resolve General Questions
    const ignoreKeys = ['structured', '__structured', 'flat_evaluations', 'purchase_funnel', '_metadata', 'question_map', 'session', 'phone', 'location', 'age', 'gender', 'name'];
    const otherQuestions = Object.entries(answers).filter(([k]) => {
        if (ignoreKeys.includes(k)) return false;
        if (k.startsWith('aw ') || k.startsWith('pb ') || k.startsWith('pf ') || k.startsWith('aw_') || k.startsWith('pb_') || k.startsWith('pf_')) return false;
        return true;
    });

    const hasStructuredData = moduleSections.length > 0 || Object.keys(groupedEvals).length > 0 || otherQuestions.length > 0;

    return (
        <div className="space-y-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted border-b border-line/80 dark:border-line/10 pb-2">{title}</h4>

            {/* Module answers (PF, Usage, Pricing) from snapshots */}
            {moduleSections.map((section) => (
                <NestedCollapsible key={section.moduleId} title={section.title} level={1} defaultOpen={true}>
                    {section.entries.map(({ id, value }) => (
                        <NestedCollapsible
                            key={`${section.moduleId}-${id}`}
                            title={resolveAnswerLabel(id, labelMap, questionMap)}
                            level={3}
                            defaultOpen={true}
                            badge={id.split('_')[0]}
                        >
                            <div className="flex items-start gap-3 mt-1">
                                <span className="text-emerald-500 font-black shrink-0 text-sm mt-0.5">A:</span>
                                <div className="flex-1 min-w-0">
                                    <RenderAnswerValue
                                        value={value}
                                        questionMap={questionMap}
                                        labelMap={labelMap}
                                        surveyId={surveyId}
                                    />
                                </div>
                            </div>
                        </NestedCollapsible>
                    ))}
                </NestedCollapsible>
            ))}

            {/* Evaluations Section */}
            {Object.keys(groupedEvals).map(brand => (
                <NestedCollapsible
                    key={brand}
                    title={`Evaluations: ${brand === 'overall' ? 'Overall Choice' : brand}`}
                    level={1}
                    defaultOpen={true}
                    badge={brandGroups[brand] && brandGroups[brand] !== 'overall' ? brandGroups[brand] : undefined}
                >
                    <div className="space-y-3">
                        {Object.keys(groupedEvals[brand]).map(attr => (
                            <NestedCollapsible key={attr} title={attr} level={2} defaultOpen={true}>
                                {groupedEvals[brand][attr].map((metric: any, idx: number) => (
                                    <NestedCollapsible
                                        key={idx}
                                        title={metric.metric}
                                        level={3}
                                        defaultOpen={true}
                                    >
                                        <div className="flex items-start gap-3 text-sm font-black text-ink bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-md border border-emerald-100 dark:border-emerald-900/30">
                                            <span className="text-emerald-500 font-black shrink-0">A:</span>
                                            <RenderAnswerValue
                                                value={metric.value}
                                                questionMap={questionMap}
                                                labelMap={labelMap}
                                                surveyId={surveyId}
                                            />
                                        </div>
                                    </NestedCollapsible>
                                ))}
                            </NestedCollapsible>
                        ))}
                    </div>
                </NestedCollapsible>
            ))}

            {/* General Additional Questions Section */}
            {otherQuestions.length > 0 && (
                <NestedCollapsible title="General Questions" level={1} defaultOpen={true}>
                    {otherQuestions.map(([key, value]) => {
                        const qMeta = questionMap[key] || {};
                        const titleStr = qMeta.text || key.replace(/_/g, ' ');
                        return (
                            <NestedCollapsible key={key} title={titleStr} level={3} defaultOpen={true}>
                                <div className="flex items-start gap-3 text-sm font-black text-ink bg-surface-raised/50 p-3 rounded-md border border-line/80 dark:border-line/10">
                                    <span className="text-slate-400 font-black shrink-0">A:</span>
                                    <div className="whitespace-pre-wrap flex-1">
                                        <RenderAnswerValue
                                            value={value}
                                            questionMap={questionMap}
                                            labelMap={labelMap}
                                            surveyId={surveyId}
                                        />
                                    </div>
                                </div>
                            </NestedCollapsible>
                        );
                    })}
                </NestedCollapsible>
            )}

            {/* Absolute Fallback */}
            {!hasStructuredData && (
                <div className="p-4 bg-surface-raised/50 rounded-2xl border border-line/80 dark:border-line/10 text-sm font-mono text-ink-muted whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(answers, null, 2)}
                </div>
            )}
        </div>
    );
}


export default function SurveyResponses() {
    const { surveyId } = useParams<{ surveyId: string }>();
    const [overview, setOverview] = useState<any>(null);
    const [respondents, setRespondents] = useState<any[]>([]);
    const [totalRespondents, setTotalRespondents] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingRespondents, setLoadingRespondents] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [expandedToken, setExpandedToken] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [showExclusionModal, setShowExclusionModal] = useState(false);
    const [modalConfig, setModalConfig] = useState<any>({ token: '', currentReason: '' });

    const fetchOverview = useCallback(async () => {
        if (!surveyId) return;
        try {
            const data = await responses.getOverview(surveyId);
            setOverview(data);
        } catch (err) {
            toast.error('Failed to load overview');
        }
    }, [surveyId]);

    const handleToggleExclude = async (token: string, excluded: boolean, reason?: string) => {
        if (!surveyId) return;
        try {
            await responses.toggleExclude(surveyId, token, { excluded, exclusion_reason: reason });
            toast.success(excluded ? 'Response excluded' : 'Response included');
            fetchOverview();
            fetchRespondents();
            // Refresh detail if expanded
            if (expandedToken === token) {
                const updatedDetail = await responses.getRespondentDetail(surveyId, token);
                setDetailData(updatedDetail);
            }
        } catch (err) {
            toast.error('Failed to update response status');
        }
    };

    const fetchRespondents = useCallback(async (resetPage = false) => {
        if (!surveyId) return;
        setLoadingRespondents(true);
        const p = resetPage ? 1 : page;
        if (resetPage) setPage(1);
        try {
            const params: any = { page: p, page_size: 30 };
            if (activeFilter !== 'all') params.lifecycle = activeFilter;
            if (searchQuery.trim()) params.search = searchQuery.trim();
            const data = await responses.getRespondents(surveyId, params);
            setRespondents(data.items || []);
            setTotalRespondents(data.total || 0);
        } catch (err) {
            toast.error('Failed to load respondents');
        } finally {
            setLoadingRespondents(false);
        }
    }, [surveyId, activeFilter, searchQuery, page]);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await fetchOverview();
            setLoading(false);
        };
        init();
    }, [fetchOverview]);

    useEffect(() => {
        fetchRespondents();
    }, [fetchRespondents]);

    const handleFilterChange = (filter: string) => {
        setActiveFilter(filter);
        setPage(1);
        setExpandedToken(null);
    };

    const handleExpand = async (token: string) => {
        if (expandedToken === token) {
            setExpandedToken(null);
            setDetailData(null);
            return;
        }
        setExpandedToken(token);
        setDetailLoading(true);
        try {
            const data = await responses.getRespondentDetail(surveyId!, token);
            setDetailData(data);
        } catch {
            toast.error('Failed to load respondent details');
        } finally {
            setDetailLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-8 pb-20 animate-pulse">
                <div className="h-10 w-48 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl" />
                <div className="h-48 bg-slate-200/30 dark:bg-slate-800/30 rounded-[2.5rem]" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-200/30 dark:bg-slate-800/30 rounded-3xl" />)}
                </div>
                <div className="h-96 bg-slate-200/20 dark:bg-slate-800/20 rounded-[2.5rem]" />
            </div>
        );
    }

    const progressPct = overview?.respondent_target
        ? Math.min(100, Math.round((overview.respondent_count / overview.respondent_target) * 100))
        : 0;

    const surveyStatus = overview?.status || 'draft';
    const isFinished = overview?.respondent_target > 0 && overview?.respondent_count >= overview?.respondent_target;

    const filterTabs = [
        { key: 'all', label: 'All', count: totalRespondents },
        { key: 'verified_complete', label: 'Complete', count: overview?.verified_complete || 0 },
        { key: 'verified_incomplete', label: 'Incomplete', count: overview?.verified_incomplete || 0 },
        { key: 'rejected', label: 'Rejected', count: overview?.rejected || 0 },
        { key: 'excluded', label: 'Excluded', count: overview?.excluded_count || 0 },
        { key: 'pending', label: 'Pending', count: overview?.pending || 0 },
    ];

    const totalPages = Math.ceil(totalRespondents / 30);

    return (
        <div className="space-y-8 pb-20">
            {/* Back + Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div>
                    <Link
                        to="/surveys"
                        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-primary-soft transition-colors mb-4"
                    >
                        <ArrowLeft size={14} />
                        Back to Surveys
                    </Link>
                    <h1 className="text-4xl font-display font-black tracking-tight text-ink">
                        {overview?.company_name || 'Survey'} <span className="text-slate-400 font-light">Responses</span>
                    </h1>
                    <div className="flex items-center gap-3 mt-3">
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${isFinished
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : surveyStatus === 'active'
                                ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                : surveyStatus === 'closed'
                                    ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                                    : 'bg-slate-500/10 text-slate-600 border-slate-500/20'
                            }`}>
                            {isFinished ? 'Target Reached' : surveyStatus}
                        </span>
                        <span className="text-sm font-black text-ink-muted">
                            {overview?.respondent_count || 0} / {overview?.respondent_target || 0}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        to={`/surveys/${surveyId}/report`}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all
                            ${overview?.target_reached
                                ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:bg-blue-600 active:scale-95'
                                : 'bg-surface-sunken text-ink-subtle cursor-not-allowed border border-slate-200 dark:border-slate-700'
                            }`}
                        onClick={(e) => {
                            if (!overview?.target_reached) {
                                e.preventDefault();
                                toast.info('Report unlocks when the response target is reached.');
                            }
                        }}
                    >
                        <Activity size={14} />
                        View Report
                    </Link>
                    <button
                        onClick={() => { fetchOverview(); fetchRespondents(true); }}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-surface border border-slate-200 dark:border-slate-700 text-ink-muted font-black text-xs uppercase tracking-widest hover:border-primary/50 transition-all active:scale-95"
                    >
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-surface/50 rounded-3xl border border-line/80 dark:border-line/10 p-6 shadow-sm transition-colors">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Collection Progress</span>
                    <span className="text-sm font-black text-primary-soft">{progressPct}%</span>
                </div>
                <div className="h-3 bg-surface-sunken rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className={`h-full rounded-full ${isFinished
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                            : 'bg-gradient-to-r from-primary to-blue-400'
                            }`}
                    />
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard icon={Users} label="Total Links" value={overview?.token_summary?.total || 0} color="blue" />
                <StatCard icon={CheckCircle2} label="Complete" value={overview?.verified_complete || 0} color="emerald" />
                <StatCard icon={AlertTriangle} label="Incomplete" value={overview?.verified_incomplete || 0} color="amber" subtext="Passed L1" />
                <StatCard icon={XCircle} label="Rejected" value={overview?.rejected || 0} color="rose" />
                <StatCard icon={AlertTriangle} label="Excluded" value={overview?.excluded_count || 0} color="slate" subtext="Low Quality" />
                <StatCard icon={Clock} label="Pending" value={overview?.pending || 0} color="slate" subtext="Unused" />
            </div>

            {/* Packaging Heatmap aggregate analytics */}
            {overview?.packaging_heatmap?.enabled && surveyId && (
                <NestedCollapsible title="Packaging Heatmap" level={1} defaultOpen={true}>
                    <PackagingHeatmapAggregateViewer surveyId={surveyId} />
                </NestedCollapsible>
            )}

            {/* Filter Tabs + Search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-1.5 bg-surface border border-line/80 dark:border-line/10 rounded-2xl p-1.5 w-fit shadow-sm">
                    {filterTabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => handleFilterChange(tab.key)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === tab.key
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                        >
                            {tab.label} <span className="opacity-60 ml-0.5">({tab.count})</span>
                        </button>
                    ))}
                </div>
                <div className="relative group flex-1 max-w-xs">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-soft transition-colors" />
                    <input
                        type="text"
                        placeholder="Search name, phone, token..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                        className="w-full bg-surface border border-line/80 dark:border-line/10 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold text-ink focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* Respondents List */}
            <div className="bg-surface/50 rounded-[2.5rem] border border-line/80 dark:border-line/10 overflow-hidden shadow-premium transition-colors">
                {loadingRespondents ? (
                    <div className="p-16 flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 animate-spin text-primary-soft" />
                    </div>
                ) : respondents.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-surface-sunken rounded-3xl flex items-center justify-center mx-auto mb-4">
                            <Users className="w-7 h-7 text-slate-400" />
                        </div>
                        <h3 className="font-display font-black text-lg text-ink mb-1">No respondents found</h3>
                        <p className="text-sm font-bold text-slate-500">
                            {searchQuery ? 'Try adjusting your search.' : 'No one has used a survey link yet.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                        {respondents.map((r: any, idx: number) => {
                            const isExpanded = expandedToken === r.token;
                            return (
                                <motion.div
                                    key={r.token}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: idx * 0.03 }}
                                >
                                    {/* Summary Row */}
                                    <button
                                        onClick={() => handleExpand(r.token)}
                                        className={`w-full flex items-center gap-4 px-8 py-5 text-left transition-colors group relative ${r.excluded ? 'bg-slate-50/50 dark:bg-slate-950/20' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'}`}
                                    >
                                        {r.excluded && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-300 dark:bg-slate-700" />
                                        )}
                                        {/* Avatar */}
                                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-display font-black shrink-0 border transition-colors ${r.lifecycle_state === 'verified_complete'
                                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200 dark:border-emerald-800/50'
                                            : r.lifecycle_state === 'rejected'
                                                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 border-rose-200 dark:border-rose-800/50'
                                                : r.lifecycle_state === 'verified_incomplete'
                                                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 border-amber-200 dark:border-amber-800/50'
                                                    : 'bg-surface-sunken text-slate-500 border-slate-200 dark:border-slate-700'
                                            }`}>
                                            {r.respondent_name ? r.respondent_name.charAt(0).toUpperCase() : '#'}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3">
                                                <span className={`font-black text-sm truncate ${r.excluded ? 'text-slate-400 line-through' : 'text-ink'}`}>
                                                    {r.respondent_name || 'Anonymous'}
                                                </span>
                                                <LifecycleBadge state={r.excluded ? 'excluded' : r.lifecycle_state} />
                                                {r.excluded && (
                                                    <span className="px-2 py-0.5 rounded-lg bg-surface-sunken text-[8px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 dark:border-slate-700">
                                                        Quality Flag
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                {r.respondent_phone && (
                                                    <span className="flex items-center gap-1">
                                                        <Phone size={10} /> {r.respondent_phone}
                                                    </span>
                                                )}
                                                {r.respondent_gender && (
                                                    <span className="flex items-center gap-1">
                                                        <User size={10} /> {r.respondent_gender.split('/')[0].trim()}
                                                    </span>
                                                )}
                                                {r.respondent_age && (
                                                    <span className="flex items-center gap-1">
                                                        <Hash size={10} /> {r.respondent_age}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Answers badge */}
                                        <div className="hidden sm:flex items-center gap-6 shrink-0">
                                            {r.has_l1 && (
                                                <div className="text-center">
                                                    <div className="text-xs font-black text-slate-800 dark:text-slate-200">{r.l1_answer_count}</div>
                                                    <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">L1</div>
                                                </div>
                                            )}
                                            {r.has_l2 && (
                                                <div className="text-center">
                                                    <div className="text-xs font-black text-slate-800 dark:text-slate-200">{r.l2_answer_count}</div>
                                                    <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">L2</div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Timestamp + Chevron */}
                                        <div className="hidden md:block text-right shrink-0">
                                            <div className="text-[10px] font-bold text-slate-500">
                                                {r.submitted_at
                                                    ? new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                    : r.created_at
                                                        ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                        : '—'}
                                            </div>
                                        </div>
                                        <motion.div
                                            animate={{ rotate: isExpanded ? 90 : 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <ChevronRight size={16} className="text-slate-400" />
                                        </motion.div>
                                    </button>

                                    {/* Expanded Detail */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-8 pb-8 pt-2 bg-slate-50/50 dark:bg-slate-950/30 border-t border-line/80 dark:border-line/10">
                                                    {detailLoading ? (
                                                        <div className="py-12 flex items-center justify-center">
                                                            <RefreshCw className="w-5 h-5 animate-spin text-primary-soft" />
                                                        </div>
                                                    ) : detailData ? (
                                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-4">
                                                            {/* Left Column — Profile + Timeline */}
                                                            <div className="lg:col-span-4 space-y-6">
                                                                {/* Profile Card */}
                                                                <div className="bg-surface rounded-2xl border border-line/80 dark:border-line/10 p-5 space-y-4">
                                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Respondent Profile</h4>
                                                                    <div className="space-y-3">
                                                                        {[
                                                                            { icon: User, label: 'Name', value: detailData.respondent_name },
                                                                            { icon: Phone, label: 'Phone', value: detailData.respondent_phone },
                                                                            { icon: User, label: 'Gender', value: detailData.respondent_gender },
                                                                            { icon: Calendar, label: 'Age', value: detailData.respondent_age },
                                                                            { icon: MapPin, label: 'Area', value: detailData.respondent_area },
                                                                            { icon: Activity, label: 'SES Class', value: detailData.respondent_ses },
                                                                        ].filter(f => f.value).map(f => (
                                                                            <div key={f.label} className="flex items-center gap-3">
                                                                                <f.icon size={14} className="text-slate-400 shrink-0" />
                                                                                <div>
                                                                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{f.label}</div>
                                                                                    <div className="text-sm font-bold text-ink">{f.value}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>

                                                                    <div className="pt-2 border-t border-line/80 dark:border-line/10">
                                                                        {!detailData.excluded ? (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setModalConfig({ token: detailData.token, currentReason: '' });
                                                                                    setShowExclusionModal(true);
                                                                                }}
                                                                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-raised text-rose-500 border border-slate-100 dark:border-slate-700 font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-200 transition-all"
                                                                            >
                                                                                <Ban size={12} />
                                                                                Exclude Response
                                                                            </button>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => handleToggleExclude(detailData.token, false)}
                                                                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500/20 transition-all"
                                                                            >
                                                                                <RotateCcw size={12} />
                                                                                Include Response
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Exclusion Reason Display */}
                                                                {detailData.excluded && (
                                                                    <div className="bg-surface-sunken/80 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <AlertTriangle size={14} className="text-slate-500" />
                                                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Exclusion Reason</h4>
                                                                        </div>
                                                                        <p className="text-sm font-bold text-ink-muted italic">"{detailData.exclusion_reason || 'No reason provided'}"</p>
                                                                        {detailData.excluded_at && (
                                                                            <div className="text-[10px] font-bold text-slate-400 mt-2">
                                                                                Excluded on {new Date(detailData.excluded_at).toLocaleDateString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Rejection Reason */}
                                                                {detailData.lifecycle_state === 'rejected' && detailData.rejection_reason && (
                                                                    <div className="bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-200 dark:border-rose-800/50 p-5">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <ShieldX size={14} className="text-rose-500" />
                                                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">Rejection Reason</h4>
                                                                        </div>
                                                                        <p className="text-sm font-bold text-rose-700 dark:text-rose-300 leading-relaxed">{detailData.rejection_reason}</p>
                                                                    </div>
                                                                )}

                                                                {/* Incomplete Notice */}
                                                                {detailData.lifecycle_state === 'verified_incomplete' && (
                                                                    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/50 p-5">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <AlertTriangle size={14} className="text-amber-500" />
                                                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">Incomplete Response</h4>
                                                                        </div>
                                                                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                                                                            Respondent passed screening but did not complete the full survey. The link may have been closed or abandoned.
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* Timeline */}
                                                                {detailData.timeline && detailData.timeline.length > 0 && (
                                                                    <div className="bg-surface rounded-2xl border border-line/80 dark:border-line/10 p-5">
                                                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted mb-4">Lifecycle Timeline</h4>
                                                                        <div>
                                                                            {detailData.timeline.map((ev: any, i: number) => (
                                                                                <TimelineEvent
                                                                                    key={i}
                                                                                    event={ev.event}
                                                                                    timestamp={ev.timestamp}
                                                                                    icon={ev.icon}
                                                                                    isLast={i === detailData.timeline.length - 1}
                                                                                />
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Right Column — Answers */}
                                                            <div className="lg:col-span-8 space-y-6">
                                                                <AnswerSection
                                                                    title="Screening Answers (Layer 1)"
                                                                    answers={detailData.l1_answers}
                                                                    emptyMessage="No screening data collected"
                                                                />
                                                                <Layer2AnswerSection
                                                                    title="Full Survey Answers (Layer 2)"
                                                                    answers={detailData.l2_answers}
                                                                    moduleSnapshots={overview?.module_snapshots}
                                                                    surveyId={surveyId}
                                                                    emptyMessage={
                                                                        detailData.lifecycle_state === 'verified_incomplete'
                                                                            ? 'Respondent did not complete this section'
                                                                            : detailData.lifecycle_state === 'rejected'
                                                                                ? 'Respondent was rejected before this stage'
                                                                                : 'No data yet'
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-8 py-5 bg-slate-50/50 dark:bg-slate-950/30 border-t border-line/80 dark:border-line/10">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Page {page} of {totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-surface border border-slate-200 dark:border-slate-700 hover:border-primary/50 disabled:opacity-40 transition-all"
                            >
                                Previous
                            </button>
                            <button
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                                className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-surface border border-slate-200 dark:border-slate-700 hover:border-primary/50 disabled:opacity-40 transition-all"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ExclusionModal
                isOpen={showExclusionModal}
                onClose={() => setShowExclusionModal(false)}
                onConfirm={(reason: string) => {
                    handleToggleExclude(modalConfig.token, true, reason);
                    setShowExclusionModal(false);
                }}
            />
        </div>
    );
}
