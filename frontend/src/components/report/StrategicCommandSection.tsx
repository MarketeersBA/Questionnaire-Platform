import { useEffect, useState } from 'react';
import {
    Zap,
    TrendingDown,
    ShieldAlert,
    Brain,
    ArrowRight,
    PlayCircle,
    Flag,
    Activity,
    Layers,
    Pencil,
    Check,
    X,
    Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { analytics } from '../../services/api';

interface OpportunityAction {
    action: string;
    category: string;
    index: number;
}

interface OpportunityInsight {
    title: string;
    insight: string;
    strategic_category: string;
    impact: string;
    effort: string;
    priority_level: number;
    actions: OpportunityAction[];
    score: number;
    gap_magnitude: number;
    confidence: number;
    attribute: string;
}

export function StrategicCommandSection({
    insights,
    surveyId,
    editable = false,
}: {
    insights: OpportunityInsight[];
    surveyId?: string;
    editable?: boolean;
}) {
    const [localInsights, setLocalInsights] = useState(insights);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draftText, setDraftText] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLocalInsights(insights);
    }, [insights]);

    if (!localInsights || localInsights.length === 0) return null;

    const canEdit = editable && Boolean(surveyId);

    const startEdit = (oppIdx: number, actionIdx: number, currentText: string) => {
        if (!canEdit || saving) return;
        setEditingKey(`${oppIdx}:${actionIdx}`);
        setDraftText(currentText);
    };

    const cancelEdit = () => {
        setEditingKey(null);
        setDraftText('');
    };

    const saveEdit = async (oppIdx: number, actionIdx: number) => {
        if (!surveyId || saving) return;
        const nextText = draftText.trim();
        if (!nextText) {
            toast.error('Tactical step cannot be empty');
            return;
        }

        const previous = localInsights;
        const nextInsights = localInsights.map((opp, i) => {
            if (i !== oppIdx) return opp;
            return {
                ...opp,
                actions: opp.actions.map((action, j) =>
                    j === actionIdx ? { ...action, action: nextText } : action
                ),
            };
        });

        setLocalInsights(nextInsights);
        setSaving(true);
        try {
            await analytics.updateOpportunityInsights(surveyId, nextInsights);
            toast.success('Tactical step updated');
            setEditingKey(null);
            setDraftText('');
        } catch (err: any) {
            setLocalInsights(previous);
            toast.error(err?.response?.data?.detail || 'Failed to save tactical step');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-12 animate-fade-in">
            {/* Section Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-500/10 rounded-xl">
                            <Zap className="text-rose-500 w-5 h-5 fill-rose-500/20" />
                        </div>
                        <h2 className="text-xs font-black text-rose-500 uppercase tracking-[0.5em]">
                            Strategic Intelligence
                        </h2>
                    </div>
                    <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                        Business Objective Alignment
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 font-medium max-w-2xl">
                        High-impact strategic playbooks derived from performance gaps and consumer undercurrents.
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/10">
                    <Activity className="text-indigo-500 w-4 h-4" />
                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        Engine Status: Optimized
                    </span>
                </div>
            </div>

            {/* Strategic Playbooks Grid */}
            <div className="space-y-10">
                {localInsights.map((opp, idx) => (
                    <div key={idx} className="group relative">
                        {/* Background Decoration */}
                        <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/5 to-rose-500/5 rounded-[48px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                        <div className="relative glass-panel rounded-[40px] overflow-hidden border border-slate-100 dark:border-white/5 shadow-2xl transition-all duration-500 group-hover:-translate-y-2">
                            {/* Accent Glow */}
                            <div className={`absolute top-0 left-0 w-full h-1.5 ${opp.impact === 'High' ? 'bg-rose-500' : 'bg-amber-500'} opacity-80`} />

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                                {/* Left Column: Signal Intelligence */}
                                <div className="lg:col-span-5 p-10 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/40">
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${opp.strategic_category === 'Product' ? 'bg-indigo-500/10 text-indigo-600' :
                                            opp.strategic_category === 'Marketing' ? 'bg-emerald-500/10 text-emerald-600' :
                                                'bg-slate-500/10 text-slate-500'
                                            }`}>
                                            {opp.strategic_category} Focus
                                        </div>
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-500 shadow-sm">
                                            <Layers className="w-3 h-3" />
                                            Priority {opp.priority_level}
                                        </div>
                                    </div>

                                    <h4 className="text-3xl font-black text-slate-900 dark:text-white mb-6 leading-[1.1] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                        {opp.title}
                                    </h4>

                                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium mb-10 text-lg">
                                        {opp.insight}
                                    </p>

                                    {/* Decision Matrix */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-5 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 shadow-sm">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Performance Gap</span>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-3xl font-black text-rose-500 italic">-{opp.gap_magnitude.toFixed(1)}</span>
                                                <TrendingDown className="text-rose-500 w-5 h-5" />
                                            </div>
                                        </div>
                                        <div className="p-5 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 shadow-sm">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Business Impact</span>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full ${opp.impact === 'High' ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`} />
                                                <span className="text-xl font-black text-slate-800 dark:text-white uppercase">{opp.impact}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/5">
                                        <div className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <Brain className="w-4 h-4" />
                                                <span className="font-bold uppercase tracking-widest text-[10px]">Statistical Confidence</span>
                                            </div>
                                            <span className="font-black text-slate-800 dark:text-white">{(opp.confidence * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="mt-2 h-1.5 w-full bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                                style={{ width: `${opp.confidence * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Tactical Playbook */}
                                <div className="lg:col-span-7 p-10 bg-white/30 dark:bg-slate-900/20">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                                <PlayCircle className="text-white w-6 h-6" />
                                            </div>
                                            <div>
                                                <h5 className="text-lg font-black text-slate-900 dark:text-white leading-none">Execution Playbook</h5>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                    {canEdit ? 'Click a step to edit content' : 'Tactical Implementation steps'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${opp.effort === 'Low' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600' :
                                            'bg-amber-500/5 border-amber-500/20 text-amber-600'
                                            }`}>
                                            <Flag className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-black uppercase tracking-wider">{opp.effort} Effort</span>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {opp.actions.map((action, i) => {
                                            const key = `${idx}:${i}`;
                                            const isEditing = editingKey === key;

                                            return (
                                                <div
                                                    key={i}
                                                    className="group/item flex items-start gap-5 p-6 rounded-3xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300"
                                                >
                                                    <div className="flex flex-col items-center gap-2 pt-1">
                                                        <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center text-xs font-black text-slate-400 border border-slate-100 dark:border-white/5 group-hover/item:bg-indigo-500 group-hover/item:text-white transition-colors">
                                                            0{i + 1}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                                                                {action.category}
                                                            </span>
                                                            {canEdit ? (
                                                                isEditing ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => saveEdit(idx, i)}
                                                                            disabled={saving}
                                                                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50"
                                                                            title="Save"
                                                                        >
                                                                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={cancelEdit}
                                                                            disabled={saving}
                                                                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                                                                            title="Cancel"
                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => startEdit(idx, i, action.action)}
                                                                        className="p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors"
                                                                        title="Edit step"
                                                                    >
                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )
                                                            ) : (
                                                                <ArrowRight className="w-4 h-4 text-slate-300 group-hover/item:text-indigo-500 transition-colors transform group-hover/item:translate-x-1" />
                                                            )}
                                                        </div>
                                                        {isEditing ? (
                                                            <textarea
                                                                value={draftText}
                                                                onChange={(e) => setDraftText(e.target.value)}
                                                                rows={3}
                                                                autoFocus
                                                                className="w-full rounded-2xl border-2 border-indigo-500/40 bg-white dark:bg-slate-950 px-4 py-3 text-[15px] font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-4 focus:ring-indigo-500/10 resize-y"
                                                            />
                                                        ) : (
                                                            <p
                                                                className={`text-slate-700 dark:text-slate-200 font-bold leading-snug text-[15px] ${canEdit ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400' : ''}`}
                                                                onClick={() => startEdit(idx, i, action.action)}
                                                            >
                                                                {action.action}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-8 flex items-center gap-4 p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                                        <ShieldAlert className="text-indigo-500 w-5 h-5 shrink-0" />
                                        <p className="text-[11px] font-bold text-indigo-600/80 leading-tight italic uppercase tracking-wider">
                                            Priority Recommendation: Execute Step 01 within the next 30 days to mitigate further brand erosion.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
