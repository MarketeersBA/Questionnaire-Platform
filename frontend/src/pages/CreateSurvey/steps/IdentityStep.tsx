import { useEffect, useState } from 'react';
import { Layout, ShieldCheck, Check, Briefcase, GraduationCap, Layers, Lock, Target, SplitSquareHorizontal, Sparkles, Edit3, ChevronDown, Palette, Tag, Beaker, Zap, DollarSign, Loader2, CheckCircle2, XCircle, Wand2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StepProps, DEFAULT_TASTE_CONFIG, DEFAULT_PRODUCT_TEST_CONFIG } from '../types';
import { surveys } from '../../../services/api';
import api from '../../../services/api';
import { useNavigate } from 'react-router-dom';

export const surveyTypesList = [
    { id: 'taste_test', name: 'Taste Test', desc: 'Product comparison, sensory profiling, and preference mapping.', icon: Beaker, color: 'text-primary-soft', bg: 'bg-primary/10' },
    { id: 'product_test', name: 'Product Test', desc: 'In-home use tests (IHUT) and performance evaluation.', icon: Palette, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'concept_test', name: 'Concept Test', desc: 'Validate new ideas, packaging, or messaging.', icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-50' }
];

// ─── Local Input Component for Smarter Typing ──────────────────────────────
function LocalQuotaInput({
    value,
    onChange,
    disabled,
    label,
    placeholder,
    className
}: {
    value: number | null,
    onChange: (val: string) => void,
    disabled: boolean,
    label: string,
    placeholder: string,
    className: string
}) {
    const [localValue, setLocalValue] = useState<string>(value?.toString() ?? '');

    useEffect(() => {
        setLocalValue(value?.toString() ?? '');
    }, [value]);

    return (
        <div className="relative">
            <input
                type="text"
                placeholder={placeholder}
                disabled={disabled}
                value={localValue}
                onWheel={e => e.currentTarget.blur()}
                onChange={e => {
                    const v = e.target.value;
                    // Allow mid-typing states like empty, minus, or decimals
                    if (v === '' || v === '.' || v === '-' || !isNaN(Number(v))) {
                        setLocalValue(v);
                        onChange(v);
                    }
                }}
                onBlur={() => {
                    // Normalize on blur
                    setLocalValue(value?.toString() ?? '');
                }}
                className={className}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">{label}</span>
        </div>
    );
}

// ─── Reusable Quota Panel Component ─────────────────────────────────────────
interface QuotaPanelProps {
    gateKey: string;
    options: string[];
    sampleCapacity: number;
    gate_quotas: Record<string, Record<string, { count: number | null; pct: number | null }>>;
    locked_quotas: Record<string, Record<string, boolean>>;
    setFormData: StepProps['setFormData'];
}

function QuotaPanel({ gateKey, options, sampleCapacity, gate_quotas, locked_quotas, setFormData }: QuotaPanelProps) {
    const target = sampleCapacity || 0;
    const quotas = gate_quotas?.[gateKey] || {};
    const locks = locked_quotas?.[gateKey] || {};

    // Auto-initialize or re-divide if the number of options or target changes
    useEffect(() => {
        if (target > 0 && options.length > 0 && Object.keys(quotas).length === 0) {
            applyEqualShare();
        }
    }, [options.length, target]);

    const toggleLock = (option: string) => {
        setFormData(prev => ({
            ...prev,
            locked_quotas: {
                ...(prev.locked_quotas || {}),
                [gateKey]: {
                    ...(prev.locked_quotas?.[gateKey] || {}),
                    [option]: !prev.locked_quotas?.[gateKey]?.[option]
                }
            }
        }));
    };

    const updateBucket = (option: string, field: 'count' | 'pct', raw: string) => {
        const cleanRaw = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

        setFormData(prev => {
            const prevGateQuotas = prev.gate_quotas || {};
            const prevGate = prevGateQuotas[gateKey] || {};
            const t = prev.sample_capacity || 0;
            const currentLocks = prev.locked_quotas?.[gateKey] || {};

            if (cleanRaw === '' || cleanRaw === '.') {
                return {
                    ...prev,
                    gate_quotas: {
                        ...prevGateQuotas,
                        [gateKey]: {
                            ...prevGate,
                            [option]: { count: null, pct: null }
                        }
                    }
                };
            }

            const val = parseFloat(cleanRaw);
            if (isNaN(val) || val < 0) return prev;

            if (t <= 0) {
                return {
                    ...prev,
                    gate_quotas: {
                        ...prevGateQuotas,
                        [gateKey]: {
                            ...prevGate,
                            [option]: {
                                count: field === 'count' ? Math.round(val) : 0,
                                pct: field === 'pct' ? val : 0
                            }
                        }
                    }
                };
            }

            let nextCount = 0;
            let nextPct = 0;

            if (field === 'count') {
                nextCount = Math.round(val);
                nextPct = parseFloat(((nextCount / t) * 100).toFixed(1));
            } else {
                nextPct = val;
                nextCount = Math.round((val / 100) * t);
            }

            const otherOptions = options.filter(o => o !== option);
            if (otherOptions.length === 0) {
                return {
                    ...prev,
                    gate_quotas: {
                        ...prevGateQuotas,
                        [gateKey]: { [option]: { count: t, pct: 100 } }
                    }
                };
            }

            const newGate: Record<string, { count: number | null; pct: number | null }> = {};
            newGate[option] = { count: nextCount, pct: nextPct };

            const lockedOthers = otherOptions.filter(o => currentLocks[o]);
            const unlockedOthers = otherOptions.filter(o => !currentLocks[o]);

            lockedOthers.forEach(o => {
                const c = prevGate[o]?.count || 0;
                newGate[o] = { count: c, pct: parseFloat(((c / t) * 100).toFixed(1)) };
            });

            const totalLockedAndCurrent = nextCount + lockedOthers.reduce((sum, o) => sum + (prevGate[o]?.count || 0), 0);
            const totalRemainingForUnlocked = Math.max(0, t - totalLockedAndCurrent);

            if (unlockedOthers.length > 0) {
                const currentUnlockedTotal = unlockedOthers.reduce((sum, o) => sum + (prevGate[o]?.count || 0), 0);
                let distributed = 0;
                unlockedOthers.forEach((o, i) => {
                    let adjCount = 0;
                    if (i === unlockedOthers.length - 1) {
                        adjCount = totalRemainingForUnlocked - distributed;
                    } else if (currentUnlockedTotal > 0) {
                        adjCount = Math.round(((prevGate[o]?.count || 0) / currentUnlockedTotal) * totalRemainingForUnlocked);
                    } else {
                        adjCount = Math.round(totalRemainingForUnlocked / unlockedOthers.length);
                    }

                    adjCount = Math.max(0, adjCount);
                    newGate[o] = { count: adjCount, pct: parseFloat(((adjCount / t) * 100).toFixed(1)) };
                    distributed += adjCount;
                });
            }

            return {
                ...prev,
                gate_quotas: {
                    ...prevGateQuotas,
                    [gateKey]: newGate
                }
            };
        });
    };

    const applyEqualShare = () => {
        if (options.length === 0) return;

        setFormData(prev => {
            const t = prev.sample_capacity || 0;
            if (t <= 0) {
                alert("Please set a Sample Capacity first to calculate equal shares.");
                return prev;
            }

            const prevGateQuotas = prev.gate_quotas || {};
            const newGate: Record<string, { count: number; pct: number }> = {};
            const base = Math.floor(t / options.length);
            const remainder = t % options.length;

            options.forEach((opt, i) => {
                const count = base + (i === options.length - 1 ? remainder : 0);
                newGate[opt] = { count, pct: parseFloat(((count / t) * 100).toFixed(1)) };
            });

            const newLocks = { ...(prev.locked_quotas || {}), [gateKey]: {} };
            return {
                ...prev,
                gate_quotas: { ...prevGateQuotas, [gateKey]: newGate },
                locked_quotas: newLocks
            };
        });
    };

    const totalAllocated = options.reduce((sum, opt) => sum + (quotas[opt]?.count || 0), 0);
    const isOver = target > 0 && totalAllocated > target;
    const isComplete = target > 0 && totalAllocated === target;
    const fillPct = target > 0 ? Math.min((totalAllocated / target) * 100, 100) : 0;

    if (options.length === 0) return null;

    return (
        <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <SplitSquareHorizontal className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">Quota Distribution</span>
                </div>
                <button
                    type="button"
                    onClick={applyEqualShare}
                    className="text-[10px] font-black uppercase tracking-widest text-primary-soft hover:text-primary-soft/70 transition-colors border border-primary/30 px-2.5 py-1.5 rounded-lg"
                >
                    ⚖ Equal Share
                </button>
            </div>

            <div className="space-y-1.5">
                {options.map(opt => {
                    const bucket = quotas[opt] || { count: null, pct: null };
                    const displayOpt = opt.length > 28 ? opt.slice(0, 28) + '…' : opt;
                    return (
                        <div key={opt} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-1.5">
                            <span className="text-xs font-bold text-ink-muted truncate" title={opt}>
                                {displayOpt}
                            </span>
                            <button
                                type="button"
                                onClick={() => toggleLock(opt)}
                                className={`p-1.5 rounded-lg transition-all ${locks[opt] ? 'bg-indigo-500 text-white' : 'bg-surface-sunken text-slate-400 hover:text-slate-600'}`}
                            >
                                <Lock className={`w-3 h-3 ${locks[opt] ? 'animate-in zoom-in-50' : 'opacity-40'}`} />
                            </button>
                            <LocalQuotaInput
                                value={bucket.count}
                                label="n"
                                placeholder="—"
                                disabled={locks[opt]}
                                onChange={v => updateBucket(opt, 'count', v)}
                                className={`w-20 bg-surface border rounded-lg pl-1.5 pr-5 py-1.5 text-xs font-black text-center transition-all focus:outline-none ${locks[opt] ? 'border-indigo-500/50 text-indigo-600 dark:text-indigo-400' : 'border-slate-300 dark:border-slate-600 text-ink focus:border-primary'}`}
                            />
                            <LocalQuotaInput
                                value={bucket.pct}
                                label="%"
                                placeholder="—"
                                disabled={locks[opt]}
                                onChange={v => updateBucket(opt, 'pct', v)}
                                className={`w-20 bg-surface border rounded-lg pl-1.5 pr-5 py-1.5 text-xs font-black text-center transition-all focus:outline-none ${locks[opt] ? 'border-indigo-500/50 text-indigo-600 dark:text-indigo-400' : 'border-slate-300 dark:border-slate-600 text-ink focus:border-primary'}`}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Sum progress bar */}
            <div className="space-y-1 p-2.5 rounded-2xl bg-surface-raised border border-slate-200/50 dark:border-slate-800/50 transition-colors">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-tighter">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isComplete ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : isOver ? 'bg-rose-500' : 'bg-primary animate-pulse'}`} />
                        <span className={isOver ? 'text-rose-500' : isComplete ? 'text-emerald-500' : 'text-ink-muted'}>
                            {totalAllocated} / {target} <span className="opacity-60">Allocated</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isComplete && <div className="flex items-center gap-1 text-emerald-500"><Lock className="w-2.5 h-2.5" /> <span className="tracking-widest">Balanced</span></div>}
                        {!isComplete && !isOver && <span className="text-slate-400 font-bold">{target - totalAllocated} Need Filling</span>}
                        {isOver && <span className="text-rose-500 font-bold">{- (target - totalAllocated)} Over Capacity</span>}
                    </div>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : isComplete ? 'bg-emerald-500' : 'bg-primary shadow-[0_0_10px_rgba(59,130,246,0.3)]'}`}
                        style={{ width: `${fillPct}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Main IdentityStep ───────────────────────────────────────────────────────
export default function IdentityStep({ formData, setFormData, onOpenClone, draftSurveyId }: StepProps) {
    const navigate = useNavigate();
    const [customModules, setCustomModules] = useState<any[]>([]);
    
    useEffect(() => {
        const fetchCustomModules = async () => {
            try {
                const res = await api.get('/modules/');
                setCustomModules(res.data.filter((m: any) => m.module_id.startsWith('custom_')));
            } catch (err) {
                console.error('Failed to fetch custom modules', err);
            }
        };
        fetchCustomModules();
    }, []);
    const cfg = formData.layer1_screening_config;
    const target = formData.sample_capacity || 0;
    const linkCount = formData.links_count || 0;

    const [isCheckingCode, setIsCheckingCode] = useState(false);
    const [codeAvailable, setCodeAvailable] = useState<boolean | null>(null);
    const [codeError, setCodeError] = useState<string | null>(null);

    // The survey code is the analyst's own project reference, so it is typed
    // rather than generated. Auto-filling a random "PJ-XXXXXX" meant the field
    // arrived pre-satisfied and most surveys shipped with a meaningless code
    // nobody could match back to their project.

    // Debounced survey code check
    useEffect(() => {
        const checkCode = async () => {
            if (!formData.survey_code) {
                setCodeAvailable(null);
                setCodeError(null);
                return;
            }

            // Optional: local format validation
            if (formData.survey_code.length < 3) {
                setCodeAvailable(false);
                setCodeError('Code too short');
                return;
            }

            setIsCheckingCode(true);
            try {
                const { exists } = await surveys.checkCode(formData.survey_code, draftSurveyId);
                setCodeAvailable(!exists);
                setCodeError(exists ? 'Survey code already taken' : null);
            } catch (err) {
                console.error('Error checking survey code:', err);
                setCodeError('Uniqueness check failed');
                setCodeAvailable(null);
            } finally {
                setIsCheckingCode(false);
            }
        };

        const timeout = setTimeout(checkCode, 500);
        return () => clearTimeout(timeout);
    }, [formData.survey_code]);


    return (
        <div className="glass-card bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[3rem] p-8 shadow-premium text-left relative overflow-hidden animate-slide-up border-2 border-slate-200 dark:border-slate-700 transition-colors max-w-5xl mx-auto">
            <div className="absolute top-0 right-0 p-5 opacity-[0.03] dark:opacity-[0.05]">
                <Layout className="w-32 h-32 rotate-12" />
            </div>
            <div className="flex items-center gap-4 mb-6 relative z-10 transition-colors">
                <div className="p-3.5 rounded-2xl bg-primary/5 dark:bg-primary/10 text-primary-soft border border-primary/10 dark:border-primary/20 shadow-inner-soft">
                    <Layout className="w-6 h-6" />
                </div>
                <div className="flex-1 flex items-center justify-between">
                    <h3 className="text-2xl font-display font-black text-ink transition-colors">Project <span className="text-primary-soft">Definition</span></h3>

                    {onOpenClone && (
                        <button
                            type="button"
                            onClick={onOpenClone}
                            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl hover:shadow-primary/20"
                        >
                            <Sparkles className="w-4 h-4 text-primary-soft" />
                            Clone from Archive
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 relative z-10">
                {/* Project Identity: Code, Name, Industry, Category */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-muted flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5 text-primary-soft shrink-0" />
                            Survey Code
                        </label>
                        <div className="relative group">
                            <Tag className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors pointer-events-none ${codeAvailable === false ? 'text-rose-500' : codeAvailable === true ? 'text-emerald-500' : 'text-slate-400 group-focus-within:text-primary-soft'}`} />
                            <input
                                type="text"
                                value={formData.survey_code}
                                onChange={(e) =>
                                    setFormData(prev => ({
                                        ...prev,
                                        survey_code: e.target.value.toUpperCase().trimStart(),
                                    }))
                                }
                                placeholder="e.g. PJ-2026-CHEESE"
                                aria-label="Survey code"
                                className={`w-full bg-surface border-2 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-ink shadow-sm outline-none transition-all placeholder:text-slate-400 placeholder:font-medium focus:ring-4 focus:ring-primary/10 ${codeAvailable === false ? 'border-rose-500/50 focus:border-rose-500' : codeAvailable === true ? 'border-emerald-500/50 focus:border-emerald-500' : 'border-slate-300 dark:border-slate-600 focus:border-primary'}`}
                            />
                        </div>
                        <div className="h-5 flex items-center">
                            <AnimatePresence mode="wait">
                                {isCheckingCode && (
                                    <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                                        <Loader2 className="w-3 h-3 text-primary-soft animate-spin" />
                                        <span className="text-[10px] font-bold text-primary-soft uppercase tracking-wider">Validating…</span>
                                    </motion.div>
                                )}
                                {!isCheckingCode && codeAvailable === true && (
                                    <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Unique Code</span>
                                    </motion.div>
                                )}
                                {!isCheckingCode && codeAvailable === false && (
                                    <motion.div key="bad" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                                        <XCircle className="w-3 h-3 text-rose-500" />
                                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">{codeError || 'Taken'}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-muted flex items-center gap-2">
                            <Edit3 className="w-3.5 h-3.5 text-primary-soft shrink-0" />
                            Survey Name
                        </label>
                        <div className="relative group">
                            <Edit3 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-soft transition-colors pointer-events-none" />
                            <input
                                id="survey-name-input"
                                type="text"
                                placeholder="e.g. Q1 Beverage Audit"
                                className="w-full bg-surface border-2 border-slate-300 dark:border-slate-600 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-ink shadow-sm outline-none transition-all placeholder:text-slate-400 placeholder:font-medium focus:border-primary focus:ring-4 focus:ring-primary/10"
                                value={formData.survey_name}
                                onChange={e => setFormData(prev => ({ ...prev, survey_name: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="h-5" aria-hidden />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-muted flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-primary-soft shrink-0" />
                            Primary Industry
                        </label>
                        <div className="relative group">
                            <select
                                id="survey-industry-input"
                                className="w-full bg-surface border-2 border-slate-300 dark:border-slate-600 rounded-2xl px-4 pr-11 py-3.5 text-sm font-bold text-ink shadow-sm outline-none transition-all appearance-none cursor-pointer focus:border-primary focus:ring-4 focus:ring-primary/10"
                                value={formData.industry || ''}
                                onChange={e => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                            >
                                <option value="" disabled>Select Industry...</option>
                                <option value="FMCG / Beverage">FMCG / Beverage</option>
                                <option value="Personal Care">Personal Care</option>
                                <option value="Banking & Finance">Banking & Finance</option>
                                <option value="Real Estate">Real Estate</option>
                                <option value="Automotive">Automotive</option>
                                <option value="Technology">Technology</option>
                                <option value="Other">Other</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                        <div className="h-5" aria-hidden />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-muted flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5 text-primary-soft shrink-0" />
                            Product Category
                        </label>
                        <div className="relative group">
                            <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-soft transition-colors pointer-events-none" />
                            <input
                                id="config-category-input"
                                type="text"
                                placeholder="e.g. Premium Chocolate"
                                className="w-full bg-surface border-2 border-slate-300 dark:border-slate-600 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-ink shadow-sm outline-none transition-all placeholder:text-slate-400 placeholder:font-medium focus:border-primary focus:ring-4 focus:ring-primary/10"
                                value={formData.config?.category || ''}
                                onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => {
                                        const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                        return {
                                            ...prev,
                                            config: { ...baseConfig, category: val },
                                            purchase_funnel: prev.purchase_funnel
                                                ? { ...prev.purchase_funnel, category_name: val }
                                                : { is_enabled: false, category_name: val, brand_list: [] },
                                        };
                                    });
                                }}
                            />
                        </div>
                        <div className="h-5" aria-hidden />
                    </div>
                </div>

                {/* Survey Type Selector */}
                <div className="space-y-5">
                    <div className="flex items-center gap-3">
                        <Beaker className="w-5 h-5 text-primary-soft" />
                        <label className="text-sm font-black uppercase tracking-[0.2em] text-ink-muted transition-colors">Survey Type</label>
                    </div>
                    <div id="survey-type-section" className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {surveyTypesList.map((type) => (
                            <button
                                key={type.id}
                                type="button"
                                onClick={() => setFormData(prev => {
                                    const isTasteTest = type.id === 'taste_test';
                                    const isProductTest = type.id === 'product_test';
                                    return {
                                        ...prev,
                                        survey_type: type.id as any,
                                        config: (isTasteTest || isProductTest)
                                            ? (prev.config || DEFAULT_TASTE_CONFIG)
                                            : prev.config,
                                        product_test_config: isProductTest
                                            ? (prev.product_test_config || DEFAULT_PRODUCT_TEST_CONFIG)
                                            : prev.product_test_config,
                                        module_sequence: isTasteTest
                                            ? ['screening', 'taste_test', 'purchase_funnel', 'brand_usage', 'brand_pricing_behavior', 'brand_analyzer']
                                            : isProductTest
                                                ? ['screening', 'product_test']
                                                : ['screening'],
                                        purchase_funnel: isTasteTest ? {
                                            is_enabled: true,
                                            category_name: prev.purchase_funnel?.category_name || '',
                                            brand_list: prev.purchase_funnel?.brand_list || []
                                        } : prev.purchase_funnel
                                    };
                                })}
                                className={`text-left p-6 rounded-3xl border-2 transition-all group relative ${formData.survey_type === type.id
                                    ? 'border-primary bg-primary/5 dark:bg-primary/10 scale-[1.02] shadow-lg'
                                    : 'border-line/80 dark:border-line/10 bg-surface/20 hover:border-primary/40'
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded-xl ${type.bg} ${type.color} flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                                    <type.icon className="w-5 h-5" />
                                </div>
                                <h4 className="text-sm font-black uppercase tracking-widest text-ink mb-1">{type.name}</h4>
                                {formData.survey_type === type.id && (
                                    <div className="absolute top-4 right-4">
                                        <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center animate-in zoom-in">
                                            <Check className="w-2.5 h-2.5" />
                                        </div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Survey Objective Panel (Taste Test & Product Test) */}
                <AnimatePresence>
                    {(formData.survey_type === 'taste_test' || formData.survey_type === 'product_test') && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="space-y-5 overflow-hidden"
                        >
                            <div className="flex items-center gap-3">
                                <Target className="w-5 h-5 text-primary-soft" />
                                <div id="survey-objective-section" className="flex flex-col">
                                    <label className="text-sm font-black uppercase tracking-[0.2em] text-ink-muted">Business Question</label>
                                    <span className="text-xs text-slate-400 font-bold tracking-tight">Why we conducted the study</span>
                                </div>
                            </div>
                            <div className="relative group">
                                <textarea
                                    id="survey-objective-input"
                                    rows={1}
                                    placeholder="Describe the business question or research objective..."
                                    className="w-full bg-surface border-2 border-slate-300 dark:border-slate-700 rounded-2xl px-5 py-3 text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-sm shadow-sm resize-none h-12"
                                    value={formData.survey_objective || ''}
                                    onChange={e => setFormData(prev => ({
                                        ...prev,
                                        survey_objective: e.target.value,
                                        survey_objective_other: '',
                                    }))}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Attached Modules */}
                <AnimatePresence>
                    {formData.survey_type === 'taste_test' && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-3 p-3.5 bg-surface-raised/40 rounded-2xl border border-line/80 dark:border-line/10"
                        >
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-sky-500" />
                                <label className="text-xs font-black uppercase tracking-[0.16em] text-ink-muted">Attached Modules</label>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 items-stretch">
                                {/* Purchase Funnel */}
                                <div
                                    onClick={() => setFormData(prev => ({
                                        ...prev,
                                        purchase_funnel: {
                                            is_enabled: !prev.purchase_funnel?.is_enabled,
                                            category_name: prev.purchase_funnel?.category_name || prev.config?.category || '',
                                            brand_list: prev.purchase_funnel?.brand_list || []
                                        }
                                    }))}
                                    className={`px-3.5 py-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 group ${formData.purchase_funnel?.is_enabled
                                        ? 'bg-sky-500/10 border-sky-500 text-sky-900 dark:text-sky-100'
                                        : 'bg-surface border-line/80 dark:border-line/10 hover:border-sky-500/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`p-2 rounded-lg shrink-0 ${formData.purchase_funnel?.is_enabled ? 'bg-sky-500 text-white' : 'bg-surface-sunken text-slate-400 group-hover:text-sky-500'}`}>
                                            <Sparkles className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col text-left min-w-0">
                                            <span className="text-xs font-black uppercase tracking-wider leading-tight truncate">Purchase Funnel</span>
                                            <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-tight mt-0.5 truncate">Awareness & Loyalty</span>
                                        </div>
                                    </div>
                                    <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${formData.purchase_funnel?.is_enabled
                                        ? 'bg-sky-500 border-sky-600 text-white'
                                        : 'border-slate-300 dark:border-slate-600'
                                        }`}>
                                        {formData.purchase_funnel?.is_enabled && <Check className="w-3 h-3" />}
                                    </div>
                                </div>

                                {/* Brand Usage */}
                                <div
                                    onClick={() => setFormData(prev => ({
                                        ...prev,
                                        brand_usage: {
                                            ...prev.brand_usage,
                                            is_enabled: !prev.brand_usage?.is_enabled,
                                            target_brand: prev.brand_usage?.target_brand || '',
                                            selected_questions: prev.brand_usage?.selected_questions || ['us_q1', 'us_q2', 'us_q3', 'us_q4']
                                        }
                                    }))}
                                    className={`px-3.5 py-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 group ${formData.brand_usage?.is_enabled
                                        ? 'bg-primary/10 border-primary text-primary-soft'
                                        : 'bg-surface border-line/80 dark:border-line/10 hover:border-primary/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`p-2 rounded-lg shrink-0 ${formData.brand_usage?.is_enabled ? 'bg-primary text-white' : 'bg-surface-sunken text-slate-400 group-hover:text-primary-soft'}`}>
                                            <Zap className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col text-left min-w-0">
                                            <span className="text-xs font-black uppercase tracking-wider leading-tight truncate">Brand Usage</span>
                                            <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-tight mt-0.5 truncate">Frequency & Consumption</span>
                                        </div>
                                    </div>
                                    <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${formData.brand_usage?.is_enabled
                                        ? 'bg-primary border-primary/60 text-white'
                                        : 'border-slate-300 dark:border-slate-600'
                                        }`}>
                                        {formData.brand_usage?.is_enabled && <Check className="w-3 h-3" />}
                                    </div>
                                </div>

                                {/* Brand Pricing Behavior */}
                                <div
                                    onClick={() => setFormData(prev => ({
                                        ...prev,
                                        brand_pricing_behavior: {
                                            ...prev.brand_pricing_behavior,
                                            is_enabled: !prev.brand_pricing_behavior?.is_enabled,
                                            target_brand: prev.brand_pricing_behavior?.target_brand || '',
                                            selected_questions: prev.brand_pricing_behavior?.selected_questions || ['cb_q1', 'cb_q2', 'cb_q3', 'cb_q4']
                                        }
                                    }))}
                                    className={`px-3.5 py-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 group ${formData.brand_pricing_behavior?.is_enabled
                                        ? 'bg-sky-500/10 border-sky-500 text-sky-900 dark:text-sky-100'
                                        : 'bg-surface border-line/80 dark:border-line/10 hover:border-sky-500/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`p-2 rounded-lg shrink-0 ${formData.brand_pricing_behavior?.is_enabled ? 'bg-sky-500 text-white' : 'bg-surface-sunken text-slate-400 group-hover:text-sky-500'}`}>
                                            <DollarSign className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col text-left min-w-0">
                                            <span className="text-xs font-black uppercase tracking-wider leading-tight truncate">Purchase Behaviour</span>
                                            <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-tight mt-0.5 truncate">Price & Purchase Intent</span>
                                        </div>
                                    </div>
                                    <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${formData.brand_pricing_behavior?.is_enabled
                                        ? 'bg-sky-500 border-sky-600 text-white'
                                        : 'border-slate-300 dark:border-slate-600'
                                        }`}>
                                        {formData.brand_pricing_behavior?.is_enabled && <Check className="w-3 h-3" />}
                                    </div>
                                </div>

                                {/* Brand Analyzer */}
                                <div
                                    onClick={() => setFormData(prev => ({
                                        ...prev,
                                        brand_analyzer: {
                                            is_enabled: !prev.brand_analyzer?.is_enabled,
                                            sync_with_purchase_funnel: prev.brand_analyzer?.sync_with_purchase_funnel ?? true,
                                            selected_attributes: prev.brand_analyzer?.selected_attributes || [],
                                            brand_list: prev.brand_analyzer?.brand_list || []
                                        }
                                    }))}
                                    className={`px-3.5 py-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 group ${formData.brand_analyzer?.is_enabled
                                        ? 'bg-sky-500/10 border-sky-500 text-sky-900 dark:text-sky-100'
                                        : 'bg-surface border-line/80 dark:border-line/10 hover:border-sky-500/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`p-2 rounded-lg shrink-0 ${formData.brand_analyzer?.is_enabled ? 'bg-sky-500 text-white' : 'bg-surface-sunken text-slate-400 group-hover:text-sky-500'}`}>
                                            <ShieldCheck className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col text-left min-w-0">
                                            <span className="text-xs font-black uppercase tracking-wider leading-tight truncate">Brand Analyzer</span>
                                            <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-tight mt-0.5 truncate">Perception & Satisfaction</span>
                                        </div>
                                    </div>
                                    <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${formData.brand_analyzer?.is_enabled
                                        ? 'bg-sky-500 border-sky-600 text-white'
                                        : 'border-slate-300 dark:border-slate-600'
                                        }`}>
                                        {formData.brand_analyzer?.is_enabled && <Check className="w-3 h-3" />}
                                    </div>
                                </div>

                                {/* Custom Modules Map */}
                                {customModules.length > 0 && customModules.map(mod => {
                                    const isAttached = formData.attached_modules?.includes(mod.module_id);
                                    return (
                                        <div
                                            key={mod.module_id}
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const current = prev.attached_modules ?? [];
                                                    const next = current.includes(mod.module_id)
                                                        ? current.filter((id) => id !== mod.module_id)
                                                        : [...current, mod.module_id];
                                                    return { ...prev, attached_modules: next };
                                                });
                                            }}
                                            className={`px-3.5 py-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 group ${isAttached
                                                ? 'bg-slate-800/10 dark:bg-slate-100/10 border-slate-800 dark:border-slate-100 text-slate-900 dark:text-slate-100'
                                                : 'bg-surface border-line/80 dark:border-line/10 hover:border-slate-500/50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`p-2 rounded-lg shrink-0 ${isAttached ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'bg-surface-sunken text-slate-400 group-hover:text-slate-700'}`}>
                                                    <Layers className="w-4 h-4" />
                                                </div>
                                                <div className="flex flex-col text-left min-w-0">
                                                    <span className="text-xs font-black uppercase tracking-wider leading-tight truncate">{mod.name}</span>
                                                    <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-tight mt-0.5 truncate">{mod.description || 'Custom Logic Module'}</span>
                                                </div>
                                            </div>
                                            <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${isAttached
                                                ? 'bg-slate-800 dark:bg-slate-100 border-slate-900 dark:border-slate-200 text-white dark:text-slate-900'
                                                : 'border-slate-300 dark:border-slate-600'
                                                }`}>
                                                {isAttached && <Check className="w-3 h-3" />}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Build Your Own Module — primary call-to-action */}
                                <div
                                    onClick={() => navigate('/module-builder')}
                                    className="relative overflow-hidden px-3.5 py-3 rounded-xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-[#21A0FF] via-[#255E91] to-[#CD393B] shadow-md shadow-[#255E91]/20 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer flex items-center justify-between gap-2.5 group"
                                >
                                    <div className="pointer-events-none absolute -top-8 -right-6 w-24 h-24 rounded-full bg-white/20 blur-2xl opacity-60 group-hover:opacity-90 transition-opacity" />
                                    <div className="relative flex items-center gap-2.5 min-w-0">
                                        <div className="p-2 rounded-lg shrink-0 bg-white/25 text-white ring-1 ring-white/40">
                                            <Wand2 className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col text-left min-w-0">
                                            <span className="text-xs font-black uppercase tracking-wider leading-tight text-white truncate">Build Your Own</span>
                                            <span className="text-[10px] font-bold text-white/85 uppercase tracking-tight mt-0.5 truncate">Custom Questions & Logic</span>
                                        </div>
                                    </div>
                                    <div className="relative w-6 h-6 shrink-0 rounded-full bg-white text-[#255E91] flex items-center justify-center">
                                        <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Token + Respondent Target row */}
                <div className="p-3 bg-primary/5 dark:bg-primary/10 rounded-2xl border border-primary/20 dark:border-primary/30 space-y-2 relative overflow-hidden">
                    <div className="flex items-center justify-between gap-3">
                        <label className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-muted flex items-center gap-2">
                            <Target className="w-3.5 h-3.5 text-primary-soft" />
                            Sample Size
                        </label>
                        <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, sample_intelligence: !prev.sample_intelligence }))}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${formData.sample_intelligence ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}
                        >
                            <Sparkles className={`w-3 h-3 ${formData.sample_intelligence ? 'animate-pulse' : ''}`} />
                            {formData.sample_intelligence ? 'Intelligence: Active' : 'Manual Mode'}
                        </button>
                    </div>

                    <div className="relative group">
                        <Target className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-soft/60 group-focus-within:text-primary-soft transition-colors pointer-events-none" />
                        <input
                            type="number"
                            min="0"
                            max={formData.links_count || 10000}
                            placeholder="e.g. 200"
                            className="w-full bg-surface border border-primary/30 dark:border-primary/40 rounded-xl pl-10 pr-4 py-2.5 text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-black text-base shadow-sm placeholder:text-slate-400"
                            value={formData.sample_capacity || ''}
                            onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setFormData(prev => {
                                    const newLinks = prev.sample_intelligence ? Math.round(val / 0.2) : prev.links_count;
                                    const updatedQuotas: typeof prev.gate_quotas = {};
                                    Object.entries(prev.gate_quotas || {}).forEach(([gk, gate]) => {
                                        updatedQuotas[gk] = {};
                                        Object.entries(gate).forEach(([opt, bucket]) => {
                                            const newCount = (bucket.pct !== null && val > 0)
                                                ? Math.round((bucket.pct / 100) * val)
                                                : bucket.count;
                                            updatedQuotas[gk][opt] = { count: newCount, pct: bucket.pct };
                                        });
                                    });
                                    return {
                                        ...prev,
                                        sample_capacity: val,
                                        links_count: newLinks,
                                        gate_quotas: updatedQuotas
                                    };
                                });
                            }}
                        />
                    </div>
                    {linkCount > 0 && target > 0 && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400">
                                <span>{target} Target</span>
                                <span className={target > linkCount ? 'text-amber-500' : 'text-primary-soft'}>{((target / linkCount) * 100).toFixed(0)}% Fill</span>
                            </div>
                            <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${target > linkCount ? 'bg-amber-500' : 'bg-primary'}`}
                                    style={{ width: `${Math.min(100, (target / linkCount) * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                    <p className="text-[11px] text-slate-500">Survey closes when this many qualify. 0 = no cap.</p>
                </div>

                {/* Layer 1 Screening Configuration */}
                <div className="space-y-3 pt-4 border-t border-line/80 dark:border-line/10">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        <div className="text-sm font-black uppercase tracking-[0.2em] text-ink-muted">
                            Layer 1 <span className="text-emerald-500">Demographic Screening</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                            { id: 'ses_screening', label: 'Social Economic Level', ar: 'المستوى الاقتصادي الاجتماعي', icon: Layers, isSpecial: true }
                        ].map(field => {
                            const isActive = cfg?.[field.id as keyof typeof cfg];

                            return (
                                <div
                                    key={field.id}
                                    onClick={() => {
                                        setFormData(prev => {
                                            const config = prev.layer1_screening_config || {};
                                            const newValue = !config[field.id as keyof typeof config];
                                            let updatedConfig = { ...config, [field.id]: newValue };
                                            if (field.id === 'ses_screening' && newValue) {
                                                updatedConfig.education = true;
                                                updatedConfig.family_income = true;
                                                updatedConfig.occupation = true;
                                            }
                                            return { ...prev, layer1_screening_config: updatedConfig };
                                        });
                                    }}
                                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${isActive
                                        ? 'bg-indigo-500/10 border-indigo-500/50'
                                        : 'bg-surface border-slate-400 dark:border-slate-600 hover:border-primary'
                                        }`}
                                >
                                    <div className="flex flex-col text-left">
                                        <div className="flex items-center gap-2">
                                            {field.icon && <field.icon className={`w-3 h-3 ${isActive ? 'text-indigo-500' : 'text-slate-400'}`} />}
                                            <span className={`text-xs font-black transition-colors ${isActive ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {field.label}
                                            </span>
                                        </div>
                                        <span className={`text-sm font-black uppercase tracking-tighter ${isActive ? 'text-indigo-600 dark:text-indigo-500' : 'text-ink-muted'}`}>{field.ar}</span>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isActive
                                        ? 'bg-indigo-500 border-indigo-600 text-white shadow-sm'
                                        : 'border-slate-400 dark:border-slate-500'
                                        }`}>
                                        {isActive && <Check className="w-3 h-3" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Age Gate ─────────────────────────────── */}
                    {cfg?.age && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2"
                        >
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-black uppercase tracking-widest text-emerald-600/60 block ml-1 text-left">Qualifying Age Ranges — Select All That Apply</label>
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({
                                        ...prev,
                                        layer1_screening_config: {
                                            ...prev.layer1_screening_config!,
                                            allowed_age_ranges: ['Under 18', '18-25', '26-35', '36-45', '46-55', '56-65', '65+']
                                        }
                                    }))}
                                    className="text-xs font-black uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors"
                                >
                                    Select All
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {['Under 18', '18-25', '26-35', '36-45', '46-55', '56-65', '65+'].map(range => {
                                    const isSelected = (cfg?.allowed_age_ranges || []).includes(range);
                                    return (
                                        <button
                                            key={range}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const current = prev.layer1_screening_config?.allowed_age_ranges || [];
                                                    const updated = isSelected ? current.filter((r: string) => r !== range) : [...current, range];
                                                    return { ...prev, layer1_screening_config: { ...prev.layer1_screening_config!, allowed_age_ranges: updated } };
                                                });
                                            }}
                                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 ${isSelected
                                                ? 'bg-emerald-500 border-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                                : 'bg-surface border-slate-300 dark:border-slate-600 text-ink-muted hover:border-emerald-500'
                                                }`}
                                        >
                                            {range}
                                        </button>
                                    );
                                })}
                            </div>
                            {(cfg?.allowed_age_ranges || []).length === 0 && (
                                <p className="text-sm text-rose-400 font-bold ml-1">⚠ Select at least one age range</p>
                            )}
                            {(cfg?.allowed_age_ranges || []).length > 0 && (
                                <QuotaPanel
                                    gateKey="age"
                                    options={(cfg?.allowed_age_ranges || [])}
                                    sampleCapacity={target}
                                    gate_quotas={formData.gate_quotas || {}}
                                    locked_quotas={formData.locked_quotas || {}}
                                    setFormData={setFormData}
                                />
                            )}
                        </motion.div>
                    )}

                    {/* ── Gender Gate ──────────────────────────── */}
                    {cfg?.gender && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 space-y-2"
                        >
                            <label className="text-sm font-black uppercase tracking-widest text-blue-500/70 block ml-1">
                                Qualifying Genders — <span className="text-slate-400 normal-case font-medium">leave empty to allow all</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[{ en: 'Male', ar: 'ذكر' }, { en: 'Female', ar: 'أنثى' }].map(g => {
                                    const val = `${g.en} / ${g.ar}`;
                                    const isSelected = (cfg?.allowed_genders || []).includes(val);
                                    return (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const current = prev.layer1_screening_config?.allowed_genders || [];
                                                    const updated = isSelected ? current.filter((x: string) => x !== val) : [...current, val];
                                                    return { ...prev, layer1_screening_config: { ...prev.layer1_screening_config!, allowed_genders: updated } };
                                                });
                                            }}
                                            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all border-2 ${isSelected ? 'bg-blue-500 border-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.3)]' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 hover:border-blue-500'}`}
                                        >
                                            {g.en} / {g.ar}
                                        </button>
                                    );
                                })}
                            </div>
                            {(cfg?.allowed_genders || []).length === 0 && (
                                <p className="text-sm text-slate-400 font-bold ml-1">ℹ All genders qualify (no gender gate)</p>
                            )}
                            {(cfg?.allowed_genders || []).length > 0 && (
                                <QuotaPanel
                                    gateKey="gender"
                                    options={cfg?.allowed_genders || []}
                                    sampleCapacity={target}
                                    gate_quotas={formData.gate_quotas || {}}
                                    locked_quotas={formData.locked_quotas || {}}
                                    setFormData={setFormData}
                                />
                            )}
                        </motion.div>
                    )}

                    {/* ── Area Gate ────────────────────────────── */}
                    {cfg?.location && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-2"
                        >
                            <label className="text-sm font-black uppercase tracking-widest text-amber-600/60 block ml-1">
                                Qualifying Areas Gate — <span className="text-slate-400 normal-case font-medium">leave empty to allow All Egypt</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { en: 'Cairo', ar: 'القاهرة' },
                                    { en: 'Giza', ar: 'الجيزة' },
                                    { en: 'Delta', ar: 'الدلتا' },
                                    { en: 'Upper Egypt', ar: 'صعيد مصر' },
                                    { en: 'Alexandria', ar: 'الإسكندرية' }
                                ].map(a => {
                                    const val = `${a.en} / ${a.ar}`;
                                    const currentAreas = (cfg?.allowed_areas || []).filter((x: string) => !x.includes('All Egypt') && !x.includes('From Any Area'));
                                    const isSelected = currentAreas.includes(val);
                                    return (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const updated = isSelected ? currentAreas.filter((x: string) => x !== val) : [...currentAreas, val];
                                                    return {
                                                        ...prev,
                                                        layer1_screening_config: {
                                                            ...prev.layer1_screening_config!,
                                                            area_mode: 'mcq',
                                                            allowed_areas: updated,
                                                        },
                                                    };
                                                });
                                            }}
                                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 ${isSelected ? 'bg-amber-500 border-amber-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.3)]' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 hover:border-amber-500'}`}
                                        >
                                            {a.en} / {a.ar}
                                        </button>
                                    );
                                })}
                            </div>
                            {(cfg?.allowed_areas || []).filter((x: string) => !x.includes('All Egypt') && !x.includes('From Any Area')).length === 0 && (
                                <p className="text-sm text-slate-400 font-bold ml-1">ℹ All Egypt areas qualify (no area gate)</p>
                            )}
                            {(cfg?.allowed_areas || []).filter((x: string) => !x.includes('All Egypt')).length > 0 && (
                                <QuotaPanel
                                    gateKey="location"
                                    options={(cfg?.allowed_areas || []).filter((x: string) => !x.includes('All Egypt'))}
                                    sampleCapacity={target}
                                    gate_quotas={formData.gate_quotas || {}}
                                    locked_quotas={formData.locked_quotas || {}}
                                    setFormData={setFormData}
                                />
                            )}
                        </motion.div>
                    )}

                    {/* ── Education Gate ───────────────────────── */}
                    {cfg?.education && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10 space-y-2"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <GraduationCap className="w-4 h-4 text-emerald-500" />
                                <label className="text-sm font-black uppercase tracking-widest text-emerald-500/70 block ml-1">
                                    Qualifying Education Levels — <span className="text-slate-400 normal-case font-medium">leave empty to allow all</span>
                                </label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { en: 'Postgraduate', ar: 'دراسات عليا' },
                                    { en: 'University', ar: 'جامعي' },
                                    { en: 'Secondary', ar: 'ثانوي' },
                                    { en: 'Primary / Preparatory', ar: 'ابتدائي / إعدادي' },
                                    { en: 'Uneducated', ar: 'غير متعلم' },
                                ].map(e => {
                                    const val = `${e.en} / ${e.ar}`;
                                    const isSelected = (cfg?.allowed_education || []).includes(val);
                                    return (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const current = prev.layer1_screening_config?.allowed_education || [];
                                                    const updated = isSelected ? current.filter((x: string) => x !== val) : [...current, val];
                                                    return { ...prev, layer1_screening_config: { ...prev.layer1_screening_config!, allowed_education: updated } };
                                                });
                                            }}
                                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 ${isSelected ? 'bg-purple-500 border-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 hover:border-purple-500'}`}
                                        >
                                            {e.en} / {e.ar}
                                        </button>
                                    );
                                })}
                            </div>
                            {(cfg?.allowed_education || []).length === 0 && (
                                <p className="text-sm text-slate-400 font-bold ml-1">ℹ All education levels qualify (no education gate)</p>
                            )}
                            {(cfg?.allowed_education || []).length > 0 && (
                                <QuotaPanel
                                    gateKey="education"
                                    options={cfg?.allowed_education || []}
                                    sampleCapacity={target}
                                    gate_quotas={formData.gate_quotas || {}}
                                    locked_quotas={formData.locked_quotas || {}}
                                    setFormData={setFormData}
                                />
                            )}
                        </motion.div>
                    )}

                    {/* ── Marital Status Gate ──────────────────── */}
                    {cfg?.marital_status && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 space-y-2"
                        >
                            <label className="text-sm font-black uppercase tracking-widest text-rose-500/70 block ml-1">
                                Qualifying Marital Status — <span className="text-slate-400 normal-case font-medium">leave empty to allow all</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { en: 'Single', ar: 'أعزب' },
                                    { en: 'Married', ar: 'متزوج' },
                                    { en: 'Divorced', ar: 'مطلق' },
                                    { en: 'Widowed', ar: 'أرمل' },
                                ].map(m => {
                                    const val = `${m.en} / ${m.ar}`;
                                    const isSelected = (cfg?.allowed_marital_status || []).includes(val);
                                    return (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const current = prev.layer1_screening_config?.allowed_marital_status || [];
                                                    const updated = isSelected ? current.filter((x: string) => x !== val) : [...current, val];
                                                    return { ...prev, layer1_screening_config: { ...prev.layer1_screening_config || {}, allowed_marital_status: updated } };
                                                });
                                            }}
                                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 ${isSelected ? 'bg-rose-500 border-rose-600 text-white shadow-[0_0_12px_rgba(244,63,94,0.3)]' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 hover:border-rose-500'}`}
                                        >
                                            {m.en} / {m.ar}
                                        </button>
                                    );
                                })}
                            </div>
                            {(cfg?.allowed_marital_status || []).length === 0 && (
                                <p className="text-sm text-slate-400 font-bold ml-1">ℹ All marital statuses qualify (no gate)</p>
                            )}
                            {(cfg?.allowed_marital_status || []).length > 0 && (
                                <QuotaPanel
                                    gateKey="marital_status"
                                    options={cfg?.allowed_marital_status || []}
                                    sampleCapacity={target}
                                    gate_quotas={formData.gate_quotas || {}}
                                    locked_quotas={formData.locked_quotas || {}}
                                    setFormData={setFormData}
                                />
                            )}
                        </motion.div>
                    )}


                    {/* ── Family Income Gate ───────────────────── */}
                    {cfg?.family_income && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2"
                        >
                            <label className="text-sm font-black uppercase tracking-widest text-emerald-500/70 block ml-1">
                                Qualifying Monthly Income — <span className="text-slate-400 normal-case font-medium">leave empty to allow all</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { en: 'Below 4,000 EGP', ar: 'أقل من ٤٠٠٠ جنيه' },
                                    { en: '4,001 - 6,000 EGP', ar: '٤٠٠١ - ٦٠٠٠ جنيه' },
                                    { en: '6,001 - 12,000 EGP', ar: '٦٠٠١ - ١٢٠٠٠ جنيه' },
                                    { en: '12,001 - 40,000 EGP', ar: '١٢٠٠١ - ٤٠٠٠٠ جنيه' },
                                    { en: 'Above 40,000 EGP', ar: 'أكثر من ٤٠٠٠٠ جنيه' },
                                ].map(inc => {
                                    const val = `${inc.en} / ${inc.ar}`;
                                    //@ts-ignore
                                    const isSelected = (cfg?.allowed_income || []).includes(val);
                                    return (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const config = prev.layer1_screening_config || {};
                                                    //@ts-ignore
                                                    const current = config.allowed_income || [];
                                                    const updated = isSelected ? current.filter((x: string) => x !== val) : [...current, val];
                                                    return { ...prev, layer1_screening_config: { ...config, allowed_income: updated } };
                                                });
                                            }}
                                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 ${isSelected ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 hover:border-emerald-500'}`}
                                        >
                                            {inc.en} / {inc.ar}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* ── Occupation Gate ──────────────────────── */}
                    {cfg?.occupation && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2"
                        >
                            <label className="text-sm font-black uppercase tracking-widest text-emerald-500/70 block ml-1">
                                Qualifying Occupations — <span className="text-slate-400 normal-case font-medium">leave empty to allow all</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    {
                                        en: 'CEO / GM / Large company owner / Senior government official',
                                        ar: 'مدير تنفيذي / مدير عام / صاحب شركة كبيرة / مسؤول حكومي رفيع',
                                    },
                                    {
                                        en: 'Company manager / High-skill professional (doctor, engineer) / Trader / Small business owner / University professor',
                                        ar: 'مدير شركة / مهني عالي المهارة (طبيب، مهندس) / تاجر / صاحب مشروع صغير / أستاذ جامعي',
                                    },
                                    {
                                        en: 'Mid-level admin / Government mid-level / Small shop owner / Technician / Secondary school teacher',
                                        ar: 'إداري متوسط / موظف حكومي متوسط / صاحب محل صغير / فني / مدرس ثانوي',
                                    },
                                    {
                                        en: 'Supervisor / Clerk / Bank employee / Low-grade government employee / Primary school teacher',
                                        ar: 'مشرف / كاتب / موظف بنك / موظف حكومي درجة منخفضة / مدرس ابتدائي',
                                    },
                                    {
                                        en: 'Skilled labor (carpenter, electrician, plumber, salesman, cook, waiter)',
                                        ar: 'عامل ماهر (نجار، كهربائي، سباك، بائع، طباخ، نادل)',
                                    },
                                    {
                                        en: 'Unskilled labor / Unemployed / Servant / Street vendor',
                                        ar: 'عامل غير ماهر / عاطل عن العمل / خادم / بائع متجول',
                                    },
                                ].map(occ => {
                                    const val = `${occ.en} / ${occ.ar}`;
                                    //@ts-ignore
                                    const isSelected = (cfg?.allowed_occupations || []).includes(val);
                                    return (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const config = prev.layer1_screening_config || {};
                                                    //@ts-ignore
                                                    const current = config.allowed_occupations || [];
                                                    const updated = isSelected ? current.filter((x: string) => x !== val) : [...current, val];
                                                    return { ...prev, layer1_screening_config: { ...config, allowed_occupations: updated } };
                                                });
                                            }}
                                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all border-2 text-left ${isSelected ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 hover:border-emerald-500'}`}
                                        >
                                            {occ.en} / {occ.ar}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* ── Social Economic Status Gate ──────────── */}
                    {cfg?.ses_screening && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-2"
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-indigo-500" />
                                    <label className="text-sm font-black uppercase tracking-widest text-indigo-500/70 block ml-1">
                                        Target Social Economic Classes
                                    </label>
                                </div>
                                {(cfg?.allowed_ses || []).length > 0 && (
                                    <div className="flex gap-1.5">
                                        {(cfg?.allowed_ses || []).map(cls => (
                                            <span key={cls} className="px-2 py-0.5 rounded-md bg-indigo-500 text-white text-sm font-black tracking-widest uppercase shadow-sm animate-in fade-in zoom-in-95">
                                                {cls}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-left">
                                {[
                                    { id: 'AB', label: 'Class AB', desc: 'High Affluence (Score 12-15)' },
                                    { id: 'C1', label: 'Class C1', desc: 'Upper Mid (Score 9-11)' },
                                    { id: 'C2', label: 'Class C2', desc: 'Lower Mid (Score 6-8)' },
                                    { id: 'DE', label: 'Class DE', desc: 'Low Income (Score 3-5)' },
                                ].map(cls => {
                                    const isSelected = (cfg?.allowed_ses || []).includes(cls.id);
                                    return (
                                        <button
                                            key={cls.id}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const current = prev.layer1_screening_config?.allowed_ses || [];
                                                    const updated = isSelected ? current.filter((x: string) => x !== cls.id) : [...current, cls.id];
                                                    return { ...prev, layer1_screening_config: { ...prev.layer1_screening_config || {}, allowed_ses: updated } };
                                                });
                                            }}
                                            className={`px-5 py-3 rounded-2xl text-xs font-black transition-all border-2 flex flex-col items-start gap-0.5 ${isSelected ? 'bg-indigo-500 border-indigo-600 text-white shadow-lg' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 hover:border-indigo-500'}`}
                                        >
                                            {cls.label}
                                            <span className={`text-sm font-medium ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>{cls.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                                <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold leading-relaxed italic">
                                    ℹ SES formula: total_score = occupation(0-5) + education(1-5) + income(1-5)
                                </p>
                            </div>
                            {(cfg?.allowed_ses || []).length > 0 && (
                                <QuotaPanel
                                    gateKey="ses"
                                    options={cfg?.allowed_ses || []}
                                    sampleCapacity={target}
                                    gate_quotas={formData.gate_quotas || {}}
                                    locked_quotas={formData.locked_quotas || {}}
                                    setFormData={setFormData}
                                />
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}



