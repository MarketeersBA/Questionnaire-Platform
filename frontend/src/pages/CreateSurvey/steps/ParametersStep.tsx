import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, Tag, Layers, Palette, EyeOff, X, Info, Sparkles, Plus, ShieldCheck, Search, ChevronDown, ChevronUp, Trash2, PlusCircle, ArrowUp, ArrowDown, MoveVertical, BarChart3, Wallet, Check, Zap, Box } from 'lucide-react';
import { StepProps, DEFAULT_TASTE_CONFIG, DEFAULT_PRODUCT_TEST_CONFIG, DEFAULT_AI_FOLLOWUP } from '../types';
import {
    AI_FOLLOWUP_SURFACE_OPTIONS,
    DEFAULT_AI_FOLLOWUP_DEDUPE_WINDOW_MS,
    DEFAULT_AI_FOLLOWUP_MIN_ANSWER_LENGTH,
    withAiFollowupDefaults,
} from '../../../utils/aiFollowupConfig';
import {
    appendModuleToSequence,
    removeModuleFromSequence,
    resolveModuleSequence,
} from '../../../constants/surveyModules';
import { toast } from 'sonner';
import { masterQuestions, brandAttributes, productTestQuestions } from '../../../services/api';
import ProductTestConfigModal from '../../../components/ProductTestConfigModal';
import PackagingHeatmapConfigPanel from '../../../components/PackagingHeatmapConfigPanel';
import { ProductTestL2PreviewPanel } from '../../../components/ProductTestL2PreviewPanel';
import type { PackagingHeatmapPendingFiles } from '../../../utils/packagingHeatmapConfig';
import type { ProductTestConfig, ProductTestQuestion, PackageTestQuestion } from '../../../types/productTest';
import { resolveBrandContextFromFormConfig } from '../../../utils/productTestPlaceholderEngine';
import {
    formatTrialMediaAcceptedLabel,
    formatTrialMediaTimingLabel,
    normalizeTrialMediaCapture,
    withNormalizedTrialMediaCapture,
} from '../../../utils/trialMediaCaptureConfig';

export function ParametersStep({
    formData,
    setFormData,
    nextStep,
    attributeBanksData: propBanks,
    selectedBank: propSelectedBank,
    setSelectedBank: propSetSelectedBank,
    bankDetails: propBankDetails,
    draftSurveyId,
    packagingHeatmapPending = {},
    onPackagingHeatmapPendingChange = () => { },
}: StepProps) {
    const [brandInput, setBrandInput] = useState('');
    const [brandRole, setBrandRole] = useState<'internal' | 'competitor'>('competitor');
    const [isPtModalOpen, setIsPtModalOpen] = useState(false);
    const [ptBankCache, setPtBankCache] = useState<ProductTestQuestion[]>([]);
    const [pkgBankCache, setPkgBankCache] = useState<PackageTestQuestion[]>([]);

    // Optional module local UI state
    const [pfExpanded, setPfExpanded] = useState(false);
    const [usageExpanded, setUsageExpanded] = useState(false);
    const [pricingExpanded, setPricingExpanded] = useState(false);
    const [baExpanded, setBaExpanded] = useState(false);
    const [pfBrandInput, setPfBrandInput] = useState('');
    const [baCustomAttrInput, setBaCustomAttrInput] = useState('');
    const [expandedAttr, setExpandedAttr] = useState<number | null>(null);
    const [showCategoryConfig, setShowCategoryConfig] = useState(false);
    const [showAdvancedAiMiControls, setShowAdvancedAiMiControls] = useState(false);

    // ─── Self-contained attribute state (authoritative) ───────────────────────
    const [localBanks, setLocalBanks] = useState<{ category: string; display_name: string }[]>([]);
    const [localSelectedBank, setLocalSelectedBank] = useState<string | null>(null);
    const [localBankDetails, setLocalBankDetails] = useState<any>(null);
    const [banksLoading, setBanksLoading] = useState(false);
    const [brandImageBank, setBrandImageBank] = useState<any>(null);


    // ─── Unified Attribute Engine state ──────────────────────────────────────
    const [showLibrary, setShowLibrary] = useState(false);
    const [newMainAttrInput, setNewMainAttrInput] = useState('');
    const [suggestSubFor, setSuggestSubFor] = useState<string | null>(null);
    const [seqCollapsed, setSeqCollapsed] = useState(true);
    const [libCustomInput, setLibCustomInput] = useState({ label: '', min: '', max: '' });

    // Resolve: use local state (freshly fetched) as primary; prop as fallback for initial render
    const attributeBanksData = localBanks.length > 0 ? localBanks : (propBanks || []);
    const selectedBank = localSelectedBank ?? (propSelectedBank ?? null);
    const bankDetails = localBankDetails ?? propBankDetails;
    const setSelectedBank = (bank: string | null) => {
        setLocalSelectedBank(bank);
        propSetSelectedBank && propSetSelectedBank(bank);
    };

    // Fetch main attribute list whenever survey_type changes
    useEffect(() => {
        const fetchAttributes = async () => {
            setBanksLoading(true);
            setLocalBanks([]);
            try {
                const isTasteTest = formData.survey_type === 'taste_test';
                console.log('[ParametersStep] Fetching attrs, type:', formData.survey_type, 'isTasteTest:', isTasteTest);
                const attrs = isTasteTest
                    ? await masterQuestions.getTasteTestAttributes()
                    : await masterQuestions.getAttributes();
                console.log('[ParametersStep] Received attrs:', attrs);
                setLocalBanks(attrs.map((a: string) => ({ category: a, display_name: a })));
            } catch (err) {
                console.error('[ParametersStep] Attribute fetch failed:', err);
            } finally {
                setBanksLoading(false);
            }
        };
        if (formData.survey_type) {
            fetchAttributes();
        }
    }, [formData.survey_type]);

    const fetchBrandBank = async () => {
        try {
            setBanksLoading(true);
            const bank = await brandAttributes.getBank();
            setBrandImageBank(bank);
        } catch (err) {
            console.error('[ParametersStep] Brand bank fetch failed:', err);
            toast.error("Failed to connect to Attribute Bank");
        } finally {
            setBanksLoading(false);
        }
    };

    useEffect(() => {
        fetchBrandBank();
    }, []);

    // Pre-load question banks for product test preview (Parameters step)
    useEffect(() => {
        if (formData.survey_type !== 'product_test') return;
        let cancelled = false;
        (async () => {
            try {
                const [ptQs, pkgQs] = await Promise.all([
                    productTestQuestions.listProductQuestions(),
                    productTestQuestions.listPackageQuestions(),
                ]);
                if (!cancelled) {
                    setPtBankCache(ptQs);
                    setPkgBankCache(pkgQs);
                }
            } catch {
                if (!cancelled) {
                    toast.error('Could not load product test banks for preview');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [formData.survey_type]);

    const applyProductTestConfig = (conf: ProductTestConfig, banks?: { productBank?: ProductTestQuestion[]; packageBank?: PackageTestQuestion[] }) => {
        if (banks?.productBank) setPtBankCache(banks.productBank);
        if (banks?.packageBank) setPkgBankCache(banks.packageBank);
        setFormData(prev => {
            const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
            return {
                ...prev,
                config: { ...baseConfig, language: conf.language },
                product_test_config: withNormalizedTrialMediaCapture(conf),
            };
        });
        toast.success('Product test configuration applied');
    };

    // Fetch sub-attributes when a bank is selected
    useEffect(() => {
        if (!localSelectedBank) {
            setLocalBankDetails(null);
            return;
        }
        const fetchSubs = async () => {
            try {
                console.log('[ParametersStep] Fetching sub-attrs for:', localSelectedBank);
                const isTasteTest = formData.survey_type === 'taste_test';
                const subs = isTasteTest
                    ? await masterQuestions.getTasteTestSubAttributes(localSelectedBank)
                    : await masterQuestions.getSubAttributes(localSelectedBank);
                console.log('[ParametersStep] Sub-attrs:', subs);
                setLocalBankDetails({
                    display_name: localSelectedBank,
                    core_attributes: subs.map((s: string) => ({
                        label: s,
                        attribute_id: s.toLowerCase().replace(/\s+/g, '_')
                    }))
                });
            } catch (err) {
                console.error('[ParametersStep] Sub-attr fetch failed:', err);
            }
        };
        fetchSubs();
    }, [localSelectedBank, formData.survey_type]);

    const pfConfig = formData.purchase_funnel || { is_enabled: false, category_name: '', brand_list: [] };

    const updatePF = (updates: Partial<typeof pfConfig>) => {
        setFormData(prev => ({
            ...prev,
            purchase_funnel: { ...(prev.purchase_funnel || { is_enabled: false, category_name: '', brand_list: [] }), ...updates }
        }));
    };

    const usageConfig = formData.brand_usage || { is_enabled: false, target_brand: '', selected_questions: ['us_q1', 'us_q2', 'us_q3', 'us_q4'] };
    const pricingConfig = formData.brand_pricing_behavior || { is_enabled: false, target_brand: '', selected_questions: ['cb_q1', 'cb_q2', 'cb_q3', 'cb_q4'] };

    const updateUsage = (updates: Partial<typeof usageConfig>) => {
        setFormData(prev => {
            const current = prev.brand_usage || { is_enabled: false, target_brand: '', selected_questions: ['us_q1', 'us_q2', 'us_q3', 'us_q4'] };
            const next = { ...current, ...updates };

            let seq = resolveModuleSequence(prev);
            if (updates.is_enabled !== undefined) {
                seq = updates.is_enabled
                    ? appendModuleToSequence(seq, 'brand_usage')
                    : removeModuleFromSequence(seq, 'brand_usage');
            }

            return {
                ...prev,
                brand_usage: next,
                module_sequence: seq,
                config: { ...(prev.config || DEFAULT_TASTE_CONFIG), module_sequence: seq },
            };
        });
    };

    const updatePricing = (updates: Partial<typeof pricingConfig>) => {
        setFormData(prev => {
            const current = prev.brand_pricing_behavior || { is_enabled: false, target_brand: '', selected_questions: ['cb_q1', 'cb_q2', 'cb_q3', 'cb_q4'] };
            const next = { ...current, ...updates };

            let seq = resolveModuleSequence(prev);
            if (updates.is_enabled !== undefined) {
                seq = updates.is_enabled
                    ? appendModuleToSequence(seq, 'brand_pricing_behavior')
                    : removeModuleFromSequence(seq, 'brand_pricing_behavior');
            }

            return {
                ...prev,
                brand_pricing_behavior: next,
                module_sequence: seq,
                config: { ...(prev.config || DEFAULT_TASTE_CONFIG), module_sequence: seq },
            };
        });
    };

    const baConfig = formData.brand_analyzer || {
        is_enabled: false,
        sync_with_purchase_funnel: true,
        selected_attributes: [],
        custom_attributes: [],
        brand_list: []
    };

    const updateBA = (updates: Partial<typeof baConfig>) => {
        setFormData(prev => {
            const current = prev.brand_analyzer || {
                is_enabled: false,
                sync_with_purchase_funnel: true,
                selected_attributes: [],
                custom_attributes: [],
                brand_list: []
            };
            const next = { ...current, ...updates };

            let seq = resolveModuleSequence(prev);
            if (updates.is_enabled !== undefined) {
                seq = updates.is_enabled
                    ? appendModuleToSequence(seq, 'brand_analyzer')
                    : removeModuleFromSequence(seq, 'brand_analyzer');
            }

            return {
                ...prev,
                brand_analyzer: next,
                module_sequence: seq,
                config: { ...(prev.config || DEFAULT_TASTE_CONFIG), module_sequence: seq },
            };
        });
    };



    // Auto-populate PF category from config when it's empty
    const syncedCategory = pfConfig.category_name || formData.config?.category || '';

    // ─── Sync Attribute Sequence ──────────────────────────────────────────────
    useEffect(() => {
        setFormData(prev => {
            const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
            let currentSeq = [...(baseConfig.attribute_sequence || [])];
            let changed = false;

            const libraryAttrs = baseConfig.attributes || {};
            const customAttrs = baseConfig.custom_research_attributes || [];

            // 1. Initial State Sanitization: Remove any accidental duplicates or invalid entries
            const seenKeys = new Set<string>();
            const sanitizedSeq = currentSeq.filter(s => {
                if (!s || !s.main_attribute) return false;
                const uniqueKey = `${s.source || 'library'}-${s.main_attribute.trim().toLowerCase()}`;
                if (seenKeys.has(uniqueKey)) {
                    changed = true;
                    return false;
                }
                seenKeys.add(uniqueKey);
                return true;
            });

            if (changed) currentSeq = sanitizedSeq;

            // 2. Add missing Library attributes
            Object.entries(libraryAttrs).forEach(([mainItem, subItems]) => {
                const normalizedMain = mainItem.trim();
                const existingIdx = currentSeq.findIndex(s =>
                    s.main_attribute.trim().toLowerCase() === normalizedMain.toLowerCase() &&
                    s.source === 'library'
                );

                if (existingIdx === -1) {
                    currentSeq.push({
                        main_attribute: normalizedMain,
                        sub_attributes: [...subItems],
                        source: 'library'
                    });
                    changed = true;
                } else {
                    // Update sub-attributes presence while keeping existing order
                    const existingSubs = currentSeq[existingIdx].sub_attributes;
                    const normalizedSubItems = subItems.map(s => s.trim());

                    // Add new subs
                    const newSubs = normalizedSubItems.filter(s => !existingSubs.includes(s));
                    if (newSubs.length > 0) {
                        currentSeq[existingIdx] = {
                            ...currentSeq[existingIdx],
                            sub_attributes: [...existingSubs, ...newSubs]
                        };
                        changed = true;
                    }

                    // Remove dropped subs
                    const droppedSubs = existingSubs.filter(s => !normalizedSubItems.includes(s));
                    if (droppedSubs.length > 0) {
                        currentSeq[existingIdx] = {
                            ...currentSeq[existingIdx],
                            sub_attributes: existingSubs.filter(s => normalizedSubItems.includes(s))
                        };
                        changed = true;
                    }
                }
            });

            // 3. Add missing Custom attributes
            customAttrs.forEach(custom => {
                const normalizedMain = custom.main_attribute.trim();
                const existingIdx = currentSeq.findIndex(s =>
                    s.main_attribute.trim().toLowerCase() === normalizedMain.toLowerCase() &&
                    s.source === 'custom'
                );

                const subLabels = custom.sub_attributes.map(s => s.label.trim());

                if (existingIdx === -1) {
                    currentSeq.push({
                        main_attribute: normalizedMain,
                        sub_attributes: subLabels,
                        source: 'custom'
                    });
                    changed = true;
                } else {
                    const existingSubs = currentSeq[existingIdx].sub_attributes;

                    const newSubs = subLabels.filter(l => !existingSubs.includes(l));
                    if (newSubs.length > 0) {
                        currentSeq[existingIdx] = {
                            ...currentSeq[existingIdx],
                            sub_attributes: [...existingSubs, ...newSubs]
                        };
                        changed = true;
                    }

                    const droppedSubs = existingSubs.filter(l => !subLabels.includes(l));
                    if (droppedSubs.length > 0) {
                        currentSeq[existingIdx] = {
                            ...currentSeq[existingIdx],
                            sub_attributes: existingSubs.filter(l => subLabels.includes(l))
                        };
                        changed = true;
                    }
                }
            });

            // 4. Cleanup: Remove sequences that no longer exist in root config
            const validLibraryKeys = Object.keys(libraryAttrs).map(k => k.trim().toLowerCase());
            const validCustomKeys = customAttrs.map(c => c.main_attribute.trim().toLowerCase());

            const finalLength = currentSeq.length;
            currentSeq = currentSeq.filter(seq => {
                const normName = seq.main_attribute.trim().toLowerCase();
                if (seq.source === 'library') return validLibraryKeys.includes(normName);
                if (seq.source === 'custom') return validCustomKeys.includes(normName);
                return true;
            });

            if (currentSeq.length !== finalLength) changed = true;

            // Final safety check to avoid infinite re-renders if nothing semantically changed
            if (changed) {
                return {
                    ...prev,
                    config: {
                        ...baseConfig,
                        attribute_sequence: [...currentSeq]
                    }
                };
            }
            return prev;
        });
    }, [formData.config?.attributes, formData.config?.custom_research_attributes]);


    const renderSmartFollowupSection = () => {
        const activeSurfaces = formData.ai_followup?.eligible_surfaces?.length
            ? formData.ai_followup.eligible_surfaces
            : DEFAULT_AI_FOLLOWUP.eligible_surfaces ?? [];

        const toggleEligibleSurface = (surfaceId: string) => {
            setFormData((prev) => {
                const current = prev.ai_followup?.eligible_surfaces?.length
                    ? [...prev.ai_followup.eligible_surfaces]
                    : [...(DEFAULT_AI_FOLLOWUP.eligible_surfaces ?? [])];
                const next = current.includes(surfaceId)
                    ? current.filter((s) => s !== surfaceId)
                    : [...current, surfaceId];
                return {
                    ...prev,
                    ai_followup: {
                        ...(prev.ai_followup || DEFAULT_AI_FOLLOWUP),
                        eligible_surfaces: next,
                    },
                };
            });
        };

        return (
        <section className="space-y-6 border-t border-line/80 dark:border-line/10 pt-10" id="ai-moderator-section">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink ml-1">
                        <Sparkles className="w-3.5 h-3.5 text-primary-soft" /> Smart Follow-up Engine (AI / MI)
                    </label>
                    <p className="text-[10px] text-slate-800 dark:text-slate-300 font-black ml-1 uppercase tracking-tighter">
                        AI-driven qualitative probing for deeper open-ended insights.
                    </p>
                    <p className="text-[9px] text-primary-soft font-bold ml-1 leading-relaxed max-w-xl">
                        Runs on open-ended like / dislike / recommend questions only.
                    </p>
                </div>
                <div
                    onClick={() => setFormData(prev => ({
                        ...prev,
                        ai_followup: withAiFollowupDefaults({
                            ...(prev.ai_followup || DEFAULT_AI_FOLLOWUP),
                            is_enabled: !(prev.ai_followup?.is_enabled),
                        }),
                    }))}
                    className={`w-12 h-6 rounded-full relative cursor-pointer transition-all ${formData.ai_followup?.is_enabled ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-800'}`}
                >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.ai_followup?.is_enabled ? 'right-1' : 'left-1'}`} />
                </div>
            </div>

            {formData.ai_followup?.is_enabled && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 bg-primary/5 dark:bg-primary/10 border-2 border-primary/20 rounded-[2.5rem]"
                >
                    <div className="space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Moderation Depth</label>
                        <select
                            value={formData.ai_followup?.max_rounds || DEFAULT_AI_FOLLOWUP.max_rounds}
                            onChange={(e) => setFormData(prev => ({
                                ...prev,
                                ai_followup: { ...prev.ai_followup!, max_rounds: parseInt(e.target.value) }
                            }))}
                            className="w-full bg-surface border-2 border-line/80 dark:border-line/10 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-primary transition-all"
                        >
                            <option value={1}>1 Round (Standard Probing)</option>
                            <option value={2}>2 Rounds (Deep Diagnostic)</option>
                            <option value={3}>3 Rounds (Maximum Qualitative)</option>
                        </select>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Input Channels</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({
                                    ...prev,
                                    ai_followup: { ...prev.ai_followup!, apply_to_voice: !prev.ai_followup?.apply_to_voice }
                                }))}
                                className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${formData.ai_followup?.apply_to_voice ? 'bg-primary text-white border-primary' : 'bg-surface border-line/80 dark:border-line/10 text-slate-400'}`}
                            >
                                Voice
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({
                                    ...prev,
                                    ai_followup: { ...prev.ai_followup!, apply_to_text: !prev.ai_followup?.apply_to_text }
                                }))}
                                className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${formData.ai_followup?.apply_to_text ? 'bg-primary text-white border-primary' : 'bg-surface border-line/80 dark:border-line/10 text-slate-400'}`}
                            >
                                Text
                            </button>
                        </div>
                        <p className="text-[9px] text-ink-muted font-bold leading-relaxed ml-1">
                            Enable each channel that should trigger live AI moderation after the respondent answers.
                        </p>
                    </div>

                    <div className="space-y-3 md:col-span-2">
                        <div className="flex justify-between items-center ml-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Custom AI Instructions</label>
                            <span className={`text-[8px] font-black uppercase tracking-widest ${(formData.ai_followup?.custom_instructions?.length || 0) > 450 ? 'text-amber-500' : 'text-slate-400'
                                }`}>
                                {formData.ai_followup?.custom_instructions?.length || 0} / 500
                            </span>
                        </div>
                        <textarea
                            value={formData.ai_followup?.custom_instructions || ''}
                            onChange={(e) => {
                                const val = e.target.value.substring(0, 500);
                                setFormData(prev => ({
                                    ...prev,
                                    ai_followup: { ...prev.ai_followup!, custom_instructions: val }
                                }));
                            }}
                            placeholder="e.g., Focus on pricing sensitivity, probe deeper on taste comparisons, ask about purchase occasions..."
                            className="w-full bg-surface border-2 border-primary/20 focus:border-primary/50 rounded-2xl px-4 py-3 text-xs font-bold outline-none transition-all resize-none text-slate-800 dark:text-slate-200"
                            rows={2}
                        />
                    </div>

                    <div className="md:col-span-1 flex items-center gap-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-4 rounded-2xl">
                        <div className="p-2.5 rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 flex-shrink-0">
                            <ShieldCheck size={18} />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Context Aware</p>
                            <p className="text-[8px] text-emerald-600/70 dark:text-emerald-500/70 font-bold uppercase tracking-tighter leading-tight">Prober uses brand objectives and survey category for tailored follow-ups.</p>
                        </div>
                    </div>

                    {/* Advanced AI/MI Controls */}
                    <div className="md:col-span-3 space-y-4 pt-4 border-t border-primary/20">
                        <div
                            className="flex items-center justify-between cursor-pointer group"
                            onClick={() => setShowAdvancedAiMiControls(!showAdvancedAiMiControls)}
                        >
                            <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-ink ml-1 cursor-pointer">
                                <Settings2 className="w-3.5 h-3.5 text-primary-soft" />
                                Advanced AI/MI Controls
                            </label>
                            <div className="p-1.5 rounded-lg bg-surface-sunken text-slate-500 group-hover:text-primary-soft transition-colors">
                                {showAdvancedAiMiControls ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                        </div>

                        <AnimatePresence>
                            {showAdvancedAiMiControls && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden space-y-6"
                                >
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                            Eligible Respondent Surfaces
                                        </label>
                                        <p className="text-[9px] text-ink-muted font-bold ml-1 leading-relaxed">
                                            Default: taste-test and product-test open ends. Add heatmap surfaces only when needed.
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {AI_FOLLOWUP_SURFACE_OPTIONS.map((surface) => {
                                                const checked = activeSurfaces.includes(surface.id);
                                                return (
                                                    <button
                                                        key={surface.id}
                                                        type="button"
                                                        onClick={() => toggleEligibleSurface(surface.id)}
                                                        className={`text-left p-4 rounded-2xl border-2 transition-all ${checked
                                                            ? 'bg-primary/10 border-primary text-ink'
                                                            : 'bg-surface border-line/80 dark:border-line/10 text-slate-400'
                                                        }`}
                                                    >
                                                        <span className="text-[9px] font-black uppercase tracking-widest block">{surface.label}</span>
                                                        <span className="text-[8px] font-bold mt-1 block opacity-70">{surface.description}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                                Minimum Answer Length (characters)
                                            </label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={100}
                                                value={formData.ai_followup?.min_answer_length ?? DEFAULT_AI_FOLLOWUP_MIN_ANSWER_LENGTH}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    ai_followup: {
                                                        ...prev.ai_followup!,
                                                        min_answer_length: Math.min(100, Math.max(1, parseInt(e.target.value, 10) || DEFAULT_AI_FOLLOWUP_MIN_ANSWER_LENGTH)),
                                                    },
                                                }))}
                                                className="w-full bg-surface border-2 border-line/80 dark:border-line/10 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-primary transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                                Text Trigger Debounce (ms)
                                            </label>
                                            <input
                                                type="number"
                                                min={200}
                                                max={5000}
                                                step={100}
                                                value={formData.ai_followup?.dedupe_window_ms ?? DEFAULT_AI_FOLLOWUP_DEDUPE_WINDOW_MS}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    ai_followup: {
                                                        ...prev.ai_followup!,
                                                        dedupe_window_ms: Math.min(5000, Math.max(200, parseInt(e.target.value, 10) || DEFAULT_AI_FOLLOWUP_DEDUPE_WINDOW_MS)),
                                                    },
                                                }))}
                                                className="w-full bg-surface border-2 border-line/80 dark:border-line/10 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-primary transition-all"
                                            />
                                            <p className="text-[8px] text-slate-500 font-bold ml-1">Suppresses duplicate blur triggers per question.</p>
                                        </div>
                                    </div>

                                    {/* Per-Category AI Probing Config */}
                                    <div className="space-y-4 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                                        <div
                                            className="flex items-center justify-between cursor-pointer group"
                                            onClick={() => setShowCategoryConfig(!showCategoryConfig)}
                                        >
                                            <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-ink-muted ml-1 cursor-pointer">
                                                <Sparkles className="w-3.5 h-3.5 text-primary-soft" />
                                                Per-Category Probing Overrides
                                            </label>
                                            <div className="p-1.5 rounded-lg bg-surface-sunken text-slate-500 group-hover:text-primary-soft transition-colors">
                                                {showCategoryConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {showCategoryConfig && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                                                        {['likes', 'dislikes', 'suggestions', 'overall'].map((category) => {
                                                            const catConfig = formData.ai_followup?.category_config?.[category as keyof typeof formData.ai_followup.category_config] || {
                                                                enabled: true,
                                                                max_rounds: formData.ai_followup?.max_rounds || DEFAULT_AI_FOLLOWUP.max_rounds
                                                            };
                                                            const isCatEnabled = catConfig.enabled !== false;

                                                            return (
                                                                <div key={category} className="p-4 bg-surface border-2 border-line/80 dark:border-line/10 rounded-2xl space-y-3 shadow-sm hover:border-primary/30 transition-all">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[9px] font-black uppercase tracking-widest text-ink-muted">
                                                                            {category}
                                                                        </span>
                                                                        <div
                                                                            onClick={() => setFormData(prev => ({
                                                                                ...prev,
                                                                                ai_followup: {
                                                                                    ...prev.ai_followup!,
                                                                                    category_config: {
                                                                                        ...(prev.ai_followup?.category_config || {}),
                                                                                        [category]: { ...catConfig, enabled: !isCatEnabled }
                                                                                    }
                                                                                }
                                                                            }))}
                                                                            className={`w-8 h-4 rounded-full relative cursor-pointer transition-all ${isCatEnabled ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-800'}`}
                                                                        >
                                                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isCatEnabled ? 'right-0.5' : 'left-0.5'}`} />
                                                                        </div>
                                                                    </div>

                                                                    <div className={`transition-opacity ${!isCatEnabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                                                        <label className="text-[8px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Max Rounds</label>
                                                                        <select
                                                                            value={catConfig.max_rounds}
                                                                            onChange={(e) => setFormData(prev => ({
                                                                                ...prev,
                                                                                ai_followup: {
                                                                                    ...prev.ai_followup!,
                                                                                    category_config: {
                                                                                        ...(prev.ai_followup?.category_config || {}),
                                                                                        [category]: { ...catConfig, max_rounds: parseInt(e.target.value) }
                                                                                    }
                                                                                }
                                                                            }))}
                                                                            className="w-full bg-surface-raised/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-primary transition-all"
                                                                        >
                                                                            <option value={1}>1 Round</option>
                                                                            <option value={2}>2 Rounds</option>
                                                                            <option value={3}>3 Rounds</option>
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </section>
        );
    };

    const renderSharedProtocolsAndBrands = () => (
        <>
            {/* ═══ Testing Protocol ═══ */}
            <section className="space-y-6 border-t border-line/80 dark:border-line/10 pt-10" id="testing-protocol-section">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink ml-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-primary-soft" /> Testing Protocol / بروتوكول الاختبار
                        </label>
                        <p className="text-[10px] text-slate-800 dark:text-slate-300 font-black ml-1 uppercase tracking-tighter">Choose between branded evaluation or blind testing with product codes.</p>
                    </div>
                </div>

                <div className="flex gap-4">
                    {[
                        { id: 'branded', label: 'Branded Test', icon: Palette, desc: 'Visible brand names' },
                        { id: 'blind', label: 'Blind Test', icon: EyeOff, desc: 'Uses masked product codes' }
                    ].map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => setFormData(prev => ({
                                ...prev,
                                config: { ...(prev.config || DEFAULT_TASTE_CONFIG), testing_protocol: p.id as any }
                            }))}
                            className={`flex-1 p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center text-center gap-3 relative group ${(formData.config?.testing_protocol || 'branded') === p.id
                                ? 'bg-primary border-primary text-white shadow-xl shadow-primary/20'
                                : 'bg-surface border-line/80 dark:border-line/10 text-slate-400 hover:border-primary/50'
                                }`}
                        >
                            <div className={`p-3 rounded-2xl ${(formData.config?.testing_protocol || 'branded') === p.id ? 'bg-white/20' : 'bg-surface-raised text-slate-400 group-hover:text-primary-soft'}`}>
                                <p.icon size={20} />
                            </div>
                            <div>
                                <span className="text-xs font-black uppercase tracking-widest block">{p.label}</span>
                                <span className="text-[8px] font-bold uppercase tracking-widest opacity-60 mt-0.5 block">{p.desc}</span>
                            </div>
                            {(formData.config?.testing_protocol || 'branded') === p.id && (
                                <div className="absolute top-4 right-4">
                                    <div className="w-3 h-3 bg-white rounded-full flex items-center justify-center p-0.5">
                                        <div className="w-full h-full bg-primary rounded-full" />
                                    </div>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </section>

            {/* Brands Section */}
            <section className="space-y-10 border-t border-line/80 dark:border-line/10 pt-10">
                <div className="flex items-center justify-between" id="brand-architecture-section">
                    <div className="space-y-1">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink ml-1">
                            <Palette className="w-3 h-3 text-primary-soft" /> Brand Architecture
                        </label>
                        <p className="text-[10px] text-slate-800 dark:text-slate-400 font-black ml-1 uppercase tracking-tighter">Define the study subjects for comparison.</p>
                    </div>
                </div>

                {/* Managed Brand Tiers & Add Brand */}
                <section className="space-y-8 bg-slate-50/50 dark:bg-slate-900/50 p-10 rounded-[2.5rem] border-2 border-slate-300 dark:border-slate-700 transition-colors shadow-inner">
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1 space-y-4">
                                <input
                                    type="text"
                                    value={brandInput}
                                    onChange={e => setBrandInput(e.target.value)}
                                    onKeyPress={e => {
                                        if (e.key === 'Enter' && brandInput.trim()) {
                                            const newBrand = {
                                                name: brandInput.trim(),
                                                role: brandRole,
                                                is_pf_aided: pfConfig.is_enabled
                                            };
                                            setFormData(prev => {
                                                const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                                let nextOwnBrand = baseConfig.own_brand;

                                                if (brandRole === 'internal') {
                                                    const newData = [...(baseConfig.internal_brands_data || []), newBrand];
                                                    if (!nextOwnBrand) nextOwnBrand = newBrand.name;
                                                    return { ...prev, config: { ...baseConfig, internal_brands_data: newData, own_brand: nextOwnBrand } };
                                                } else {
                                                    const newData = [...(baseConfig.competitor_brands_data || []), newBrand];
                                                    if (!nextOwnBrand) nextOwnBrand = newBrand.name;
                                                    return { ...prev, config: { ...baseConfig, competitor_brands_data: newData, competitive_brands: newData.map(b => b.name), own_brand: nextOwnBrand } };
                                                }
                                            });
                                            setBrandInput('');
                                            toast.success('Brand added');
                                        }
                                    }}
                                    placeholder="Add brand name..."
                                    className="w-full bg-surface border-2 border-slate-400 dark:border-slate-600 focus:border-primary rounded-2xl px-6 py-4 text-sm font-bold outline-none transition-all dark:text-white shadow-sm"
                                />
                                <div className="flex items-center gap-6 px-2">
                                    <button
                                        onClick={() => setBrandRole(brandRole === 'internal' ? 'competitor' : 'internal')}
                                        className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${brandRole === 'internal' ? 'text-primary-soft' : 'text-ink'}`}
                                    >
                                        <div className={`w-10 h-5 rounded-full relative transition-all ${brandRole === 'internal' ? 'bg-primary/20' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                            <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${brandRole === 'internal' ? 'right-1 bg-primary' : 'left-1 bg-slate-900 dark:bg-slate-100'}`} />
                                        </div>
                                        Internal
                                    </button>

                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (!brandInput.trim()) return;
                                    const newBrand = { name: brandInput.trim(), role: brandRole, is_pf_aided: pfConfig.is_enabled };
                                    setFormData(prev => {
                                        const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                        let nextOwnBrand = baseConfig.own_brand;

                                        if (brandRole === 'internal') {
                                            const newData = [...(baseConfig.internal_brands_data || []), newBrand];
                                            if (!nextOwnBrand) nextOwnBrand = newBrand.name;
                                            return { ...prev, config: { ...baseConfig, internal_brands_data: newData, own_brand: nextOwnBrand } };
                                        } else {
                                            const newData = [...(baseConfig.competitor_brands_data || []), newBrand];
                                            if (!nextOwnBrand) nextOwnBrand = newBrand.name;
                                            return { ...prev, config: { ...baseConfig, competitor_brands_data: newData, competitive_brands: newData.map(b => b.name), own_brand: nextOwnBrand } };
                                        }
                                    });
                                    setBrandInput('');
                                    toast.success('Brand added');
                                }}
                                className="bg-primary text-white px-10 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                Add Brand
                            </button>
                        </div>
                    </div>

                    {/* Chips Display */}
                    <div className="flex flex-wrap gap-4 pt-4">
                        {(!formData.config?.own_brand && ([...(formData.config?.internal_brands_data || []), ...(formData.config?.competitor_brands_data || [])].length > 0)) && (
                            <div className="w-full mb-2 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 animate-pulse">
                                <Sparkles className="w-3.5 h-3.5" />
                                Action Required: Select a target brand by clicking the sparkle icon on a brand chip.
                            </div>
                        )}
                        {[...(formData.config?.internal_brands_data || []), ...(formData.config?.competitor_brands_data || [])].map(brand => {
                            const isTarget = formData.config?.own_brand === brand.name;
                            return (
                                <motion.div
                                    key={brand.name}
                                    layout
                                    className={`flex items-center gap-3 px-6 py-4 rounded-[1.5rem] border-2 shadow-sm group transition-all relative ${isTarget
                                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-500 shadow-amber-200/50'
                                        : brand.role === 'internal'
                                            ? 'bg-primary/10 border-primary/20 text-primary-soft'
                                            : 'bg-surface border-line/80 dark:border-line/10'}`}
                                >
                                    {isTarget && (
                                        <div className="absolute -top-2 -right-1 bg-amber-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full shadow-sm animate-in zoom-in-50">
                                            TARGET
                                        </div>
                                    )}

                                    <button
                                        onClick={() => {
                                            setFormData(prev => ({
                                                ...prev,
                                                config: { ...(prev.config || DEFAULT_TASTE_CONFIG), own_brand: isTarget ? '' : brand.name }
                                            }));
                                            if (!isTarget) toast.success(`"${brand.name}" set as target brand`);
                                        }}
                                        className={`p-1.5 rounded-lg transition-all ${isTarget ? 'bg-amber-500 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-500'}`}
                                        title={isTarget ? "Deselect Target" : "Set as Target Brand"}
                                    >
                                        <Sparkles className={`w-3.5 h-3.5 ${isTarget ? 'fill-current' : 'opacity-60'}`} />
                                    </button>

                                    <div className="flex flex-col">
                                        <span className="text-[7px] font-black uppercase tracking-tighter opacity-60">
                                            {brand.role === 'internal' ? 'Internal' : 'Competitor'}
                                        </span>
                                        <span className={`font-black text-sm ${isTarget ? 'text-amber-900 dark:text-amber-100' : ''}`}>
                                            {brand.name}
                                        </span>
                                        {/* Blind Code Input */}
                                        {formData.config?.testing_protocol === 'blind' && (
                                            <div className="mt-1.5 flex flex-col gap-1">
                                                <span className="text-[6px] font-black uppercase tracking-[0.2em] text-primary-soft">Blind Code</span>
                                                <input
                                                    type="text"
                                                    value={formData.config?.blind_codes?.[brand.name] || ''}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            config: {
                                                                ...prev.config!,
                                                                blind_codes: {
                                                                    ...(prev.config!.blind_codes || {}),
                                                                    [brand.name]: code
                                                                }
                                                            }
                                                        }));
                                                    }}
                                                    placeholder="e.g. SAMPLE-123"
                                                    className="bg-white/50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-widest outline-none focus:border-primary transition-all"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            setFormData(prev => {
                                                const config = prev.config!;
                                                const isDeletingTarget = config.own_brand === brand.name;
                                                const nextOwnBrand = isDeletingTarget ? '' : config.own_brand;

                                                if (brand.role === 'internal') {
                                                    const newData = config.internal_brands_data.filter(b => b.name !== brand.name);
                                                    return { ...prev, config: { ...config, internal_brands_data: newData, own_brand: nextOwnBrand } };
                                                } else {
                                                    const newData = config.competitor_brands_data.filter(b => b.name !== brand.name);
                                                    return { ...prev, config: { ...config, competitor_brands_data: newData, competitive_brands: newData.map(b => b.name), own_brand: nextOwnBrand } };
                                                }
                                            });
                                        }}
                                        className="ml-1 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-all text-slate-300"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>
            </section>
        </>
    );

    return (
        <div className="glass-card bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2.5rem] p-12 shadow-premium text-left space-y-10 animate-slide-up border-2 border-slate-200 dark:border-slate-700 transition-colors">
            <div className="flex items-center gap-4 transition-colors">
                <div className="p-3.5 rounded-2xl bg-primary/5 dark:bg-primary/10 text-primary-soft border border-primary/10 dark:border-primary/20">
                    <Settings2 className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-2xl font-display font-black text-ink transition-colors">Research <span className="text-primary-soft">Parameters</span></h3>
                    <p className="text-[10px] text-ink font-black uppercase tracking-widest leading-relaxed mt-1">Define category scope, brands, and deep research attributes.</p>
                </div>
            </div>

            {formData.survey_type !== 'taste_test' && formData.survey_type !== 'product_test' && (
                <div className="p-8 rounded-[2.5rem] bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-900/50 mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                            <Info className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-amber-900 dark:text-amber-100 uppercase tracking-widest leading-none">Blueprint Type Mismatch</h4>
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1">This page is optimized for Taste Tests. Current type: <span className="font-black underline">{formData.survey_type || 'Unset'}</span></p>
                        </div>
                    </div>
                    <button
                        onClick={() => setFormData(prev => ({ ...prev, survey_type: 'taste_test', config: prev.config || DEFAULT_TASTE_CONFIG }))}
                        className="px-6 py-2.5 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-md"
                    >
                        Force Taste Test UI
                    </button>
                </div>
            )}

            {(formData.survey_type === 'taste_test' || !formData.survey_type) && (
                <div className="space-y-12">
                    {/* Primary Parameters: Category, Protocol, Language */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Category */}
                        <div className="space-y-6 bg-slate-50/50 dark:bg-slate-950/50 p-8 rounded-[2.5rem] border-2 border-line/80 dark:border-line/10 shadow-inner">
                            <div className="flex items-center gap-3 border-b border-line/80 dark:border-line/10 pb-4 mb-2">
                                <Tag className="w-4 h-4 text-primary-soft" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-ink">Product Category</h4>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Survey Category</label>
                                <input
                                    id="config-category-input"
                                    type="text"
                                    value={formData.config?.category || ''}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setFormData(prev => {
                                            const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                            return {
                                                ...prev,
                                                config: { ...baseConfig, category: val },
                                                purchase_funnel: prev.purchase_funnel ? { ...prev.purchase_funnel, category_name: val } : { is_enabled: false, category_name: val, brand_list: [] }
                                            };
                                        });
                                    }}
                                    placeholder="e.g. Premium Chocolate"
                                    className="w-full bg-surface border-2 border-slate-300 dark:border-slate-700 focus:border-primary rounded-2xl px-6 py-4 text-sm font-bold outline-none dark:text-white transition-all shadow-sm"
                                />
                            </div>
                        </div>

                        {/* Language */}
                        <div className="space-y-6 bg-slate-50/50 dark:bg-slate-950/50 p-8 rounded-[2.5rem] border-2 border-line/80 dark:border-line/10 shadow-inner">
                            <label className="text-[10px] font-black uppercase tracking-widest text-ink ml-1">Survey Language</label>
                            <div className="flex gap-2">
                                {['en', 'ar'].map(lang => (
                                    <button
                                        key={lang}
                                        onClick={() => setFormData(prev => ({
                                            ...prev,
                                            config: { ...(prev.config || DEFAULT_TASTE_CONFIG), language: lang as any }
                                        }))}
                                        className={`flex-1 py-4 rounded-2xl text-sm font-black transition-all border-2 ${formData.config?.language === lang
                                            ? 'bg-primary border-primary text-white shadow-lg'
                                            : 'bg-surface border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-300 hover:border-primary'}`}
                                    >
                                        {lang.toUpperCase() === 'EN' ? 'English' : 'Arabic'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {renderSharedProtocolsAndBrands()}

                    {/* ═══ Unified Attribute Engine ═══ */}
                    <section className="space-y-6 border-t border-line/80 dark:border-line/10 pt-10" id="attribute-engine-section">
                        <div className="space-y-1">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink ml-1">
                                <Sparkles className="w-3.5 h-3.5 text-primary-soft" /> Attribute Engine
                            </label>
                            <p className="text-[10px] text-slate-800 dark:text-slate-300 font-black ml-1 uppercase tracking-tighter">Define main attributes and their sub-dimensions for diagnostic evaluation.</p>
                        </div>

                        {/* ── Add New Attribute Box ── */}
                        <div className="p-6 rounded-[2rem] bg-slate-50/70 dark:bg-slate-950/60 border-2 border-line/80 dark:border-line/10 shadow-inner space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-ink">Add New Attribute</span>
                            </div>
                            <div className="relative group">
                                <input
                                    type="text"
                                    id="unified-main-attr-input"
                                    value={newMainAttrInput}
                                    onChange={e => setNewMainAttrInput(e.target.value)}
                                    placeholder="Type a custom main attribute name..."
                                    className="w-full bg-surface border-2 border-slate-300 dark:border-slate-700 focus:border-primary rounded-2xl px-6 py-4 text-sm font-bold outline-none transition-all dark:text-white shadow-sm pr-16"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && newMainAttrInput.trim()) {
                                            const val = newMainAttrInput.trim();
                                            setFormData(prev => {
                                                const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                                const customs = baseConfig.custom_research_attributes || [];
                                                const libraryAttrs = baseConfig.attributes || {};
                                                if (!customs.find(c => c.main_attribute === val) && !libraryAttrs[val]) {
                                                    return { ...prev, config: { ...baseConfig, custom_research_attributes: [...customs, { main_attribute: val, sub_attributes: [] }] } };
                                                }
                                                toast.error('Attribute already exists');
                                                return prev;
                                            });
                                            setNewMainAttrInput('');
                                            setExpandedAttr((formData.config?.custom_research_attributes?.length || 0));
                                            toast.success(`Main attribute "${val}" added`);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        const val = newMainAttrInput.trim();
                                        if (!val) return;
                                        setFormData(prev => {
                                            const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                            const customs = baseConfig.custom_research_attributes || [];
                                            const libraryAttrs = baseConfig.attributes || {};
                                            if (!customs.find(c => c.main_attribute === val) && !libraryAttrs[val]) {
                                                return { ...prev, config: { ...baseConfig, custom_research_attributes: [...customs, { main_attribute: val, sub_attributes: [] }] } };
                                            }
                                            toast.error('Attribute already exists');
                                            return prev;
                                        });
                                        setNewMainAttrInput('');
                                        setExpandedAttr((formData.config?.custom_research_attributes?.length || 0));
                                        toast.success(`Main attribute "${val}" added`);
                                    }}
                                    className="absolute right-2 top-2 p-2.5 bg-primary text-white rounded-xl shadow-lg hover:scale-105 transition-all"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Suggest Main Attributes Button */}
                            <button
                                onClick={() => setShowLibrary(!showLibrary)}
                                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${showLibrary
                                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                                    : 'bg-surface border-slate-300 dark:border-slate-700 text-ink-muted hover:border-primary hover:text-primary-soft'
                                    }`}
                            >
                                <Search className="w-3.5 h-3.5" />
                                {showLibrary ? 'Hide Attribute Library' : 'Suggest Main Attributes'}
                            </button>
                        </div>

                        {/* ── Library Drawer ── */}
                        {showLibrary && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="rounded-[2rem] bg-surface border-2 border-primary/20 shadow-lg overflow-hidden"
                            >
                                <div className="p-5 bg-primary/5 dark:bg-primary/10 border-b border-primary/10 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-primary-soft" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-ink">Knowledge Graph Library</span>
                                    </div>
                                    {banksLoading && <Sparkles className="w-3 h-3 animate-spin text-primary-soft" />}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-0 max-h-[420px]">
                                    {/* Domain Sidebar */}
                                    <div className="col-span-1 md:col-span-3 flex flex-col gap-1 p-3 bg-slate-50/80 dark:bg-slate-950/80 border-r border-line/80 dark:border-line/10 overflow-y-auto max-h-[420px]">
                                        {banksLoading ? (
                                            <div className="py-8 flex flex-col items-center justify-center gap-2 opacity-50">
                                                <Search className="w-5 h-5 text-primary-soft animate-pulse" />
                                                <span className="text-[9px] font-bold uppercase tracking-widest">Loading...</span>
                                            </div>
                                        ) : attributeBanksData.length === 0 ? (
                                            <div className="py-8 flex flex-col items-center justify-center gap-2 opacity-40">
                                                <Layers className="w-5 h-5 text-slate-400" />
                                                <span className="text-[9px] font-bold uppercase tracking-widest">No domains</span>
                                            </div>
                                        ) : (
                                            attributeBanksData.map((bank: any) => (
                                                <button
                                                    key={bank.category}
                                                    onClick={() => setSelectedBank(selectedBank === bank.category ? null : bank.category)}
                                                    className={`flex items-center justify-between p-3 rounded-xl text-[11px] font-black transition-all ${selectedBank === bank.category
                                                        ? 'bg-primary text-white shadow-md'
                                                        : 'text-slate-700 dark:text-white hover:bg-white dark:hover:bg-slate-800'
                                                        }`}
                                                >
                                                    <span className="truncate">{bank.display_name}</span>
                                                    {selectedBank === bank.category && <div className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />}
                                                </button>
                                            ))
                                        )}
                                    </div>

                                    {/* Sub-attributes Panel */}
                                    <div className="col-span-1 md:col-span-9 p-5 overflow-y-auto max-h-[420px]">
                                        {selectedBank ? (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between pb-3 border-b border-line/80 dark:border-line/10">
                                                    <h4 className="text-sm font-black text-ink uppercase">{bankDetails?.display_name || selectedBank}</h4>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Click to toggle</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {bankDetails?.core_attributes?.map((attr: any) => {
                                                        const isSelected = (formData.config?.attributes || {})[selectedBank]?.includes(attr.label);
                                                        return (
                                                            <button
                                                                key={attr.attribute_id}
                                                                onClick={() => {
                                                                    setFormData(prev => {
                                                                        const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                                                        const currentAttrs = baseConfig.attributes || {};
                                                                        const subAttrs = currentAttrs[selectedBank!] || [];
                                                                        if (!subAttrs.includes(attr.label)) {
                                                                            return { ...prev, config: { ...baseConfig, attributes: { ...currentAttrs, [selectedBank!]: [...subAttrs, attr.label] } } };
                                                                        } else {
                                                                            return { ...prev, config: { ...baseConfig, attributes: { ...currentAttrs, [selectedBank!]: subAttrs.filter(a => a !== attr.label) } } };
                                                                        }
                                                                    });
                                                                    if (!isSelected) toast.success(`Added ${attr.label}`);
                                                                }}
                                                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all border ${isSelected ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 dark:text-white hover:border-primary'}`}
                                                            >
                                                                {attr.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Inline Custom Sub-Attribute Form */}
                                                <div className="mt-8 pt-6 border-t border-line/80 dark:border-line/10 space-y-4">
                                                    <div className="flex items-center gap-2">
                                                        <PlusCircle className="w-3.5 h-3.5 text-primary-soft" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-ink">Add Custom Dimension to "{selectedBank}"</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                        <input
                                                            type="text"
                                                            placeholder="Attribute Name"
                                                            value={libCustomInput.label}
                                                            onChange={e => setLibCustomInput(prev => ({ ...prev, label: e.target.value }))}
                                                            className="md:col-span-1 bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-primary dark:text-white"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Min (e.g. Weak)"
                                                            value={libCustomInput.min}
                                                            onChange={e => setLibCustomInput(prev => ({ ...prev, min: e.target.value }))}
                                                            className="bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-primary dark:text-white"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Max (e.g. Strong)"
                                                            value={libCustomInput.max}
                                                            onChange={e => setLibCustomInput(prev => ({ ...prev, max: e.target.value }))}
                                                            className="bg-surface-raised border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-primary dark:text-white"
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                if (!libCustomInput.label || !libCustomInput.min || !libCustomInput.max) {
                                                                    toast.error("Please fill all fields");
                                                                    return;
                                                                }
                                                                setFormData(prev => {
                                                                    const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                                                    const currentAttrs = baseConfig.attributes || {};
                                                                    const subAttrs = currentAttrs[selectedBank!] || [];

                                                                    const customSubsMap = baseConfig.library_custom_subs || {};
                                                                    const bankCustoms = customSubsMap[selectedBank!] || [];

                                                                    if (subAttrs.includes(libCustomInput.label)) {
                                                                        toast.error("Attribute already exists in this domain");
                                                                        return prev;
                                                                    }

                                                                    const newCustomSub = {
                                                                        label: libCustomInput.label,
                                                                        minLabel: libCustomInput.min,
                                                                        maxLabel: libCustomInput.max
                                                                    };

                                                                    return {
                                                                        ...prev,
                                                                        config: {
                                                                            ...baseConfig,
                                                                            attributes: {
                                                                                ...currentAttrs,
                                                                                [selectedBank!]: [...subAttrs, libCustomInput.label]
                                                                            },
                                                                            library_custom_subs: {
                                                                                ...customSubsMap,
                                                                                [selectedBank!]: [...bankCustoms, newCustomSub]
                                                                            }
                                                                        }
                                                                    };
                                                                });
                                                                toast.success(`Custom dimenson "${libCustomInput.label}" added`);
                                                                setLibCustomInput({ label: '', min: '', max: '' });
                                                            }}
                                                            className="bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all py-2.5"
                                                        >
                                                            Add Inline
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 opacity-40">
                                                <Layers className="w-8 h-8 text-slate-300 mb-2" />
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Select a domain</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Added Main Attributes List ── */}
                        {(() => {
                            const libraryEntries = Object.entries(formData.config?.attributes || {}).filter(([, v]: [string, any]) => v.length > 0);
                            const customEntries = formData.config?.custom_research_attributes || [];
                            const hasAny = libraryEntries.length > 0 || customEntries.length > 0;
                            if (!hasAny) return (
                                <div className="py-8 flex flex-col items-center justify-center opacity-40 bg-slate-50/50 dark:bg-slate-950/30 border-2 border-dashed border-line/80 dark:border-line/10 rounded-[2rem]">
                                    <Layers className="w-8 h-8 text-slate-300 mb-3" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No attributes added yet</p>
                                    <p className="text-[9px] text-slate-400 mt-1">Add custom or use the library above</p>
                                </div>
                            );
                            return (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1">
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-ink">Active Attributes ({libraryEntries.length + customEntries.length})</span>
                                    </div>

                                    {/* Library-sourced main attrs */}
                                    {libraryEntries.map(([bankName, attrs]: [string, any]) => (
                                        <motion.div key={`lib-${bankName}`} layout className="bg-surface rounded-2xl border-2 border-line/80 dark:border-line/10 overflow-hidden group transition-all hover:border-slate-300 dark:hover:border-slate-700">
                                            <div className="px-5 py-3.5 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-xl bg-primary/10 text-primary-soft"><Tag className="w-3.5 h-3.5" /></div>
                                                    <div>
                                                        <h5 className="font-black text-sm text-ink uppercase tracking-tight leading-none">{bankName}</h5>
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-primary-soft/70 mt-0.5 block">Library · {attrs.length} sub-attributes</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setFormData(prev => {
                                                            const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                                            const currentAttrs = { ...baseConfig.attributes };
                                                            delete currentAttrs[bankName];
                                                            return { ...prev, config: { ...baseConfig, attributes: currentAttrs } };
                                                        });
                                                    }}
                                                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="px-5 py-3 flex flex-wrap gap-2">
                                                {attrs.map((attr: string) => {
                                                    const libraryCustoms = formData.config?.library_custom_subs?.[bankName] || [];
                                                    const customMeta = libraryCustoms.find(c => c.label === attr);

                                                    return (
                                                        <div key={attr} className={`px-3 py-1 text-[10px] font-black rounded-lg flex items-center gap-1.5 border transition-all ${customMeta ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 text-amber-700 dark:text-amber-400' : 'bg-primary/10 text-primary-soft border-primary/20'}`}>
                                                            {customMeta && <Sparkles className="w-2.5 h-2.5 fill-current" />}
                                                            <div className="flex flex-col">
                                                                <span>{attr}</span>
                                                                {customMeta && (
                                                                    <span className="text-[7.5px] opacity-60 flex items-center gap-1">
                                                                        {customMeta.minLabel} <div className="w-3 h-0.5 bg-current opacity-30" /> {customMeta.maxLabel}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button onClick={() => {
                                                                setFormData(prev => {
                                                                    const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                                                    const currentAttrs = { ...baseConfig.attributes };
                                                                    currentAttrs[bankName] = currentAttrs[bankName].filter((a: string) => a !== attr);

                                                                    const nextCustomSubs = { ...baseConfig.library_custom_subs };
                                                                    if (nextCustomSubs[bankName]) {
                                                                        nextCustomSubs[bankName] = nextCustomSubs[bankName].filter(c => c.label !== attr);
                                                                    }

                                                                    if (currentAttrs[bankName].length === 0) delete currentAttrs[bankName];
                                                                    return { ...prev, config: { ...baseConfig, attributes: currentAttrs, library_custom_subs: nextCustomSubs } };
                                                                });
                                                            }} className="hover:text-rose-500 transition-colors ml-1"><X className="w-3 h-3" /></button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    ))}

                                    {/* Custom main attrs */}
                                    {customEntries.map((custom: any, cIdx: number) => (
                                        <motion.div key={`cust-${cIdx}`} layout className={`bg-surface rounded-2xl border-2 overflow-hidden group transition-all duration-300 ${expandedAttr === cIdx ? 'border-primary shadow-premium ring-4 ring-primary/5' : 'border-line/80 dark:border-line/10 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                                            {/* Header */}
                                            <div
                                                className={`px-5 py-3.5 flex items-center justify-between cursor-pointer transition-colors ${expandedAttr === cIdx ? 'bg-primary/5' : 'bg-slate-50/50 dark:bg-slate-800/30'}`}
                                                onClick={() => setExpandedAttr(expandedAttr === cIdx ? null : cIdx)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-xl transition-all ${expandedAttr === cIdx ? 'bg-primary text-white' : 'bg-surface-sunken text-slate-500'}`}>
                                                        <Sparkles className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div>
                                                        <h5 className="font-black text-sm text-ink uppercase tracking-tight leading-none">{custom.main_attribute}</h5>
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5 block">Custom · {custom.sub_attributes.length} sub-attributes</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); setFormData(prev => { const customs = [...(prev.config?.custom_research_attributes || [])]; customs.splice(cIdx, 1); return { ...prev, config: { ...prev.config!, custom_research_attributes: customs } }; }); setExpandedAttr(null); }} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    <div className={`p-1.5 rounded-lg transition-transform duration-300 ${expandedAttr === cIdx ? 'rotate-180 text-primary-soft' : 'text-slate-400'}`}><ChevronDown className="w-4 h-4" /></div>
                                                </div>
                                            </div>

                                            {/* Expanded body */}
                                            {expandedAttr === cIdx && (
                                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="px-5 pb-5 pt-2 space-y-4 border-t border-line/80 dark:border-line/10">
                                                    {/* Add custom sub-attribute */}
                                                    <div className="p-4 bg-surface-raised/50 rounded-xl space-y-3 border border-line/80 dark:border-line/10">
                                                        <div className="flex items-center gap-2">
                                                            <PlusCircle className="w-3 h-3 text-primary-soft" />
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-ink">Add Custom Sub-Attribute</span>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                            <input type="text" placeholder="Name (e.g. Crispness)" id={`sub-name-${cIdx}`} className="md:col-span-2 bg-surface border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-primary dark:text-white" />
                                                            <input type="text" placeholder="Min (Weak)" id={`sub-min-${cIdx}`} className="bg-surface border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-primary dark:text-white" />
                                                            <input type="text" placeholder="Max (Strong)" id={`sub-max-${cIdx}`} className="bg-surface border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-primary dark:text-white" />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const nameInp = document.getElementById(`sub-name-${cIdx}`) as HTMLInputElement;
                                                                const minInp = document.getElementById(`sub-min-${cIdx}`) as HTMLInputElement;
                                                                const maxInp = document.getElementById(`sub-max-${cIdx}`) as HTMLInputElement;
                                                                if (nameInp.value && minInp.value && maxInp.value) {
                                                                    const newSub = { label: nameInp.value, minLabel: minInp.value, maxLabel: maxInp.value };
                                                                    setFormData(prev => {
                                                                        if (!prev.config) return prev;
                                                                        const customs = [...(prev.config.custom_research_attributes || [])];
                                                                        customs[cIdx] = { ...customs[cIdx], sub_attributes: [...(customs[cIdx].sub_attributes || []), newSub] };
                                                                        return { ...prev, config: { ...prev.config, custom_research_attributes: customs } };
                                                                    });
                                                                    nameInp.value = ''; minInp.value = ''; maxInp.value = '';
                                                                    toast.success("Sub-attribute added");
                                                                } else { toast.error("Fill all fields"); }
                                                            }}
                                                            className="w-full py-2.5 bg-primary text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm hover:scale-[1.01] active:scale-95 transition-all"
                                                        >
                                                            Add Sub-Attribute
                                                        </button>
                                                    </div>

                                                    {/* Suggest sub-attributes from library */}
                                                    <button
                                                        onClick={() => {
                                                            setSuggestSubFor(suggestSubFor === custom.main_attribute ? null : custom.main_attribute);
                                                            setSelectedBank(custom.main_attribute);
                                                        }}
                                                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${suggestSubFor === custom.main_attribute ? 'bg-primary/10 text-primary-soft border-primary/30' : 'bg-surface border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary-soft'}`}
                                                    >
                                                        <Search className="w-3 h-3" />
                                                        Suggest Sub-Attributes
                                                    </button>

                                                    {/* Library sub-attributes suggestions */}
                                                    {suggestSubFor === custom.main_attribute && bankDetails?.core_attributes && (
                                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20">
                                                            <div className="text-[9px] font-black uppercase tracking-widest text-primary-soft mb-2">Library Suggestions</div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {bankDetails.core_attributes.map((attr: any) => {
                                                                    const alreadyHas = custom.sub_attributes.some((s: any) => s.label === attr.label);
                                                                    return (
                                                                        <button
                                                                            key={attr.attribute_id}
                                                                            disabled={alreadyHas}
                                                                            onClick={() => {
                                                                                setFormData(prev => {
                                                                                    if (!prev.config) return prev;
                                                                                    const customs = [...(prev.config.custom_research_attributes || [])];
                                                                                    const newSub = { label: attr.label, minLabel: 'Low', maxLabel: 'High' };
                                                                                    customs[cIdx] = { ...customs[cIdx], sub_attributes: [...customs[cIdx].sub_attributes, newSub] };
                                                                                    return { ...prev, config: { ...prev.config, custom_research_attributes: customs } };
                                                                                });
                                                                                toast.success(`Added "${attr.label}"`);
                                                                            }}
                                                                            className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all border ${alreadyHas ? 'bg-surface-sunken border-slate-200 dark:border-slate-700 text-slate-300 cursor-not-allowed' : 'bg-surface border-slate-300 dark:border-slate-600 text-slate-700 dark:text-white hover:border-primary hover:text-primary-soft'}`}
                                                                        >
                                                                            {alreadyHas ? '✓ ' : '+ '}{attr.label}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </motion.div>
                                                    )}

                                                    {/* Sub-attributes list */}
                                                    {custom.sub_attributes.length > 0 && (
                                                        <div className="space-y-2">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">Sub-Attributes</span>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                {custom.sub_attributes.map((sub: any, sIdx: number) => (
                                                                    <div key={sIdx} className="p-3 rounded-xl bg-surface-raised border border-line/80 dark:border-line/10 flex items-center justify-between group/pill hover:border-primary/30 transition-all">
                                                                        <div className="space-y-1">
                                                                            <div className="text-[11px] font-black text-ink uppercase tracking-tight">{sub.label}</div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-[8px] font-bold text-slate-400 uppercase">{sub.minLabel}</span>
                                                                                <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div className="w-1/2 h-full bg-primary/30" /></div>
                                                                                <span className="text-[8px] font-bold text-slate-400 uppercase">{sub.maxLabel}</span>
                                                                            </div>
                                                                        </div>
                                                                        <button onClick={() => { setFormData(prev => { if (!prev.config) return prev; const customs = [...(prev.config.custom_research_attributes || [])]; const target = { ...customs[cIdx] }; const nextSubs = [...target.sub_attributes]; nextSubs.splice(sIdx, 1); customs[cIdx] = { ...target, sub_attributes: nextSubs }; return { ...prev, config: { ...prev.config, custom_research_attributes: customs } }; }); }} className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition-all opacity-0 group-hover/pill:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    ))}
                                </div>
                            );
                        })()}
                    </section>

                    {/* ═══ Smart Follow-up Engine ═══ */}
                    {renderSmartFollowupSection()}


                    {/* ═══ Compact Evaluation Sequence Modeler ═══ */}
                    {(formData.config?.attribute_sequence && formData.config.attribute_sequence.length > 0) && (
                        <section className="space-y-3 border-t border-line/80 dark:border-line/10 pt-8" id="sequence-modeler-section">
                            <div className="flex items-center justify-between cursor-pointer" onClick={() => setSeqCollapsed(!seqCollapsed)}>
                                <div className="flex items-center gap-2">
                                    <MoveVertical className="w-3.5 h-3.5 text-primary-soft" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-ink">Evaluation Sequence</span>
                                    <span className="text-[9px] font-bold text-slate-400 ml-1">({formData.config.attribute_sequence.length} items)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm("Reset sequence order to default?")) {
                                                setFormData(prev => ({ ...prev, config: { ...prev.config!, attribute_sequence: [] } }));
                                                toast.success("Sequence order reset");
                                            }
                                        }}
                                        className="px-3 py-1 rounded-lg border border-line/80 dark:border-line/10 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 hover:border-rose-300 transition-all"
                                    >
                                        Reset
                                    </button>
                                    <div className={`p-1 rounded-lg transition-transform duration-300 ${seqCollapsed ? '' : 'rotate-180'} text-slate-400`}>
                                        <ChevronDown className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>

                            {!seqCollapsed && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-4 bg-surface-raised/50 rounded-2xl border border-line/80 dark:border-line/10">
                                    <div className="flex flex-col gap-2">
                                        {formData.config!.attribute_sequence!.map((seq, idx) => (
                                            <div key={`${seq.source}-${seq.main_attribute}`} className="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                                <div className="flex items-center justify-between px-4 py-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary-soft font-black text-[10px]">{idx + 1}</span>
                                                        <div>
                                                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 block">{seq.source === 'library' ? 'Library' : 'Custom'}</span>
                                                            <span className="text-xs font-black text-ink uppercase tracking-tight">{seq.main_attribute}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-surface p-0.5">
                                                        <button disabled={idx === 0} type="button" onClick={() => { setFormData(prev => { const s = [...prev.config!.attribute_sequence!]; const temp = s[idx - 1]; s[idx - 1] = s[idx]; s[idx] = temp; return { ...prev, config: { ...prev.config!, attribute_sequence: s } }; }); }} className={`p-1 rounded transition-colors ${idx === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-primary/10 text-slate-500 hover:text-primary-soft'}`}><ArrowUp className="w-3 h-3" /></button>
                                                        <button disabled={idx === formData.config!.attribute_sequence!.length - 1} type="button" onClick={() => { setFormData(prev => { const s = [...prev.config!.attribute_sequence!]; const temp = s[idx + 1]; s[idx + 1] = s[idx]; s[idx] = temp; return { ...prev, config: { ...prev.config!, attribute_sequence: s } }; }); }} className={`p-1 rounded transition-colors ${idx === formData.config!.attribute_sequence!.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-primary/10 text-slate-500 hover:text-primary-soft'}`}><ArrowDown className="w-3 h-3" /></button>
                                                    </div>
                                                </div>
                                                {seq.sub_attributes.length > 0 && (
                                                    <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                                                        {seq.sub_attributes.map((subAttr, subIdx) => (
                                                            <div key={`${seq.source}-${seq.main_attribute}-${subAttr}`} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-raised border border-line/80 dark:border-line/10 text-[9px] font-bold text-ink-muted">
                                                                <Layers className="w-2.5 h-2.5 text-slate-300" />
                                                                {subAttr}
                                                                <div className="flex gap-0.5 ml-1">
                                                                    <button disabled={subIdx === 0} type="button" onClick={() => { setFormData(prev => { const s = [...prev.config!.attribute_sequence!]; const targetSeq = { ...s[idx] }; const subs = [...targetSeq.sub_attributes]; const temp = subs[subIdx - 1]; subs[subIdx - 1] = subs[subIdx]; subs[subIdx] = temp; targetSeq.sub_attributes = subs; s[idx] = targetSeq; return { ...prev, config: { ...prev.config!, attribute_sequence: s } }; }); }} className={`p-0.5 rounded ${subIdx === 0 ? 'opacity-20' : 'hover:text-primary-soft'}`}><ArrowUp className="w-2.5 h-2.5" /></button>
                                                                    <button disabled={subIdx === seq.sub_attributes.length - 1} type="button" onClick={() => { setFormData(prev => { const s = [...prev.config!.attribute_sequence!]; const targetSeq = { ...s[idx] }; const subs = [...targetSeq.sub_attributes]; const temp = subs[subIdx + 1]; subs[subIdx + 1] = subs[subIdx]; subs[subIdx] = temp; targetSeq.sub_attributes = subs; s[idx] = targetSeq; return { ...prev, config: { ...prev.config!, attribute_sequence: s } }; }); }} className={`p-0.5 rounded ${subIdx === seq.sub_attributes.length - 1 ? 'opacity-20' : 'hover:text-primary-soft'}`}><ArrowDown className="w-2.5 h-2.5" /></button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </section>
                    )}


                    {/* ─── Purchase Funnel Module ─── */}
                    <section className="border-t border-line/80 dark:border-line/10 pt-10" id="purchase-funnel-section">

                        {/* Collapsed trigger */}
                        {!pfExpanded ? (
                            <button
                                onClick={() => setPfExpanded(true)}
                                className="w-full flex items-center justify-between px-10 py-7 rounded-[2.5rem] border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="p-3.5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-500 group-hover:bg-primary/10 group-hover:text-primary-soft transition-all">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-ink">+ Add Purchase Funnel Module</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Optional · Brand awareness, consideration &amp; usage tracking</p>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-slate-400 group-hover:text-primary-soft transition-colors" />
                            </button>
                        ) : (
                            /* Expanded Panel */
                            <div className={`p-10 rounded-[2.5rem] border-2 transition-all duration-300 space-y-8 ${pfConfig.is_enabled
                                ? 'bg-primary/5 dark:bg-primary/10 border-primary/30'
                                : 'bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-700'
                                }`}>

                                {/* Header row */}
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-4 rounded-2xl transition-all ${pfConfig.is_enabled
                                            ? 'bg-primary text-white shadow-xl shadow-primary/20'
                                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                                            }`}>
                                            <ShieldCheck className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className={`text-lg font-black uppercase tracking-tight ${pfConfig.is_enabled ? 'text-primary-soft' : 'text-ink'
                                                }`}>Purchase Funnel Module</h4>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Track awareness, consideration &amp; usage</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setPfExpanded(false);
                                            updatePF({ is_enabled: false, brand_list: [], category_name: '' });
                                        }}
                                        className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* PF-specific brand input */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Tag className="w-3 h-3 text-primary-soft" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-ink">
                                                Funnel Brands
                                                <span className="ml-2 text-[9px] text-slate-400 normal-case tracking-normal font-bold">— separate from your study brands above</span>
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const archBrands = [
                                                    ...(formData.config?.internal_brands_data?.map(b => b.name) || []),
                                                    ...(formData.config?.competitor_brands_data?.map(b => b.name) || [])
                                                ];
                                                const existing = pfConfig.brand_list || [];
                                                const newBrands = [...existing];
                                                let added = 0;
                                                archBrands.forEach(name => {
                                                    if (!newBrands.find((b: any) => b.name_en === name)) {
                                                        newBrands.push({ name_en: name, name_ar: name });
                                                        added++;
                                                    }
                                                });
                                                if (added > 0) {
                                                    updatePF({ brand_list: newBrands });
                                                    toast.success(`Imported ${added} brands from architecture`);
                                                } else {
                                                    toast.info("All architecture brands already in funnel");
                                                }
                                            }}
                                            className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary-soft text-[9px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all flex items-center gap-2"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                            Sync from Architecture
                                        </button>
                                    </div>

                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            value={pfBrandInput}
                                            onChange={e => setPfBrandInput(e.target.value)}
                                            onKeyPress={e => {
                                                if (e.key === 'Enter' && pfBrandInput.trim()) {
                                                    const name = pfBrandInput.trim();
                                                    const existing = pfConfig.brand_list || [];
                                                    if (!existing.find((b: any) => b.name_en === name)) {
                                                        updatePF({ brand_list: [...existing, { name_en: name, name_ar: name }] });
                                                    }
                                                    setPfBrandInput('');
                                                    toast.success(`Brand "${name}" added to funnel`);
                                                }
                                            }}
                                            placeholder="Type brand name and press Enter..."
                                            className="flex-1 bg-surface border-2 border-slate-300 dark:border-slate-700 focus:border-primary rounded-2xl px-5 py-4 text-sm font-bold outline-none transition-all text-ink placeholder:text-slate-400"
                                        />
                                        <button
                                            onClick={() => {
                                                const name = pfBrandInput.trim();
                                                if (!name) return;
                                                const existing = pfConfig.brand_list || [];
                                                if (!existing.find((b: any) => b.name_en === name)) {
                                                    updatePF({ brand_list: [...existing, { name_en: name, name_ar: name }] });
                                                }
                                                setPfBrandInput('');
                                                toast.success(`Brand "${name}" added to funnel`);
                                            }}
                                            className="px-6 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Brand chips */}
                                    {(pfConfig.brand_list || []).length > 0 && (
                                        <div className="flex flex-wrap gap-3 pt-1">
                                            {(pfConfig.brand_list || []).map((brand: any, idx: number) => (
                                                <motion.div
                                                    key={brand.name_en}
                                                    layout
                                                    initial={{ scale: 0.9, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface border-2 border-slate-200 dark:border-slate-700 shadow-sm group"
                                                >
                                                    <span className="text-sm font-black text-ink">{brand.name_en}</span>
                                                    <button
                                                        onClick={() => {
                                                            const newList = (pfConfig.brand_list || []).filter((_: any, i: number) => i !== idx);
                                                            updatePF({ brand_list: newList });
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-all"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Brand count indicator */}
                                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${(pfConfig.brand_list || []).length >= 3
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-amber-500 dark:text-amber-400'
                                        }`}>
                                        {(pfConfig.brand_list || []).length >= 3
                                            ? `✓ ${(pfConfig.brand_list || []).length} brands — module ready to enable`
                                            : `${(pfConfig.brand_list || []).length} / 3 brands minimum required`}
                                    </div>
                                </div>

                                {/* Category field */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted block">Target Category</label>
                                    <input
                                        type="text"
                                        value={syncedCategory}
                                        onChange={e => updatePF({ category_name: e.target.value })}
                                        placeholder={formData.config?.category || 'e.g. Carbonated Beverages...'}
                                        className="w-full bg-surface border-2 border-slate-300 dark:border-slate-700 focus:border-primary rounded-2xl px-6 py-4 text-sm font-black text-ink outline-none transition-all placeholder:text-slate-400"
                                    />
                                </div>

                                {/* Enable/Disable toggle */}
                                <div className="pt-2">
                                    {(pfConfig.brand_list || []).length < 3 ? (
                                        <div className="p-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl text-[10px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest">
                                            Add {3 - (pfConfig.brand_list || []).length} more brand{3 - (pfConfig.brand_list || []).length > 1 ? 's' : ''} to enable this module
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => updatePF({ is_enabled: !pfConfig.is_enabled, category_name: syncedCategory })}
                                            className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl hover:scale-[1.01] active:scale-95 ${pfConfig.is_enabled
                                                ? 'bg-primary text-white shadow-primary/30'
                                                : 'bg-surface text-ink border-2 border-slate-300 dark:border-slate-700'
                                                }`}
                                        >
                                            {pfConfig.is_enabled ? '● Module Active — Click to Disable' : '○ Enable Purchase Funnel Module'}
                                        </button>
                                    )}
                                </div>

                            </div>
                        )}
                    </section>

                    {/* ─── Brand Usage Module ─── */}
                    <section className="border-t border-line/80 dark:border-line/10 pt-10" id="brand-usage-section">
                        {!usageExpanded ? (
                            <button
                                onClick={() => setUsageExpanded(true)}
                                className="w-full flex items-center justify-between px-10 py-7 rounded-[2.5rem] border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="p-3.5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-500 group-hover:bg-primary/10 group-hover:text-primary-soft transition-all">
                                        <BarChart3 className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-ink">+ Add Brand Usage Module</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Optional · Recency, frequency, timing &amp; occasion</p>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-slate-400 group-hover:text-primary-soft transition-colors" />
                            </button>
                        ) : (
                            <div className={`p-10 rounded-[2.5rem] border-2 transition-all duration-300 space-y-8 ${usageConfig.is_enabled
                                ? 'bg-primary/5 dark:bg-primary/10 border-primary/30'
                                : 'bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-700'
                                }`}>
                                {/* Header */}
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-4 rounded-2xl transition-all ${usageConfig.is_enabled
                                            ? 'bg-primary text-white shadow-xl shadow-primary/20'
                                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                                            }`}>
                                            <BarChart3 className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className={`text-lg font-black uppercase tracking-tight ${usageConfig.is_enabled ? 'text-primary-soft' : 'text-ink'
                                                }`}>Brand Usage Module</h4>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Layer 5 · us_q1–us_q4 from question bank</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setUsageExpanded(false);
                                            updateUsage({ is_enabled: false });
                                        }}
                                        className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Question Bank Preview & Selection */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                            <Layers className="w-3 h-3" /> Question Bank Control
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-black text-slate-400 uppercase">Selected:</span>
                                            <span className="text-[8px] font-black text-primary-soft bg-primary/10 px-2 py-0.5 rounded-full">
                                                {(usageConfig.selected_questions || ['us_q1', 'us_q2', 'us_q3', 'us_q4']).length}/4
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { id: 'us_q1', label: 'Last Time Used', type: 'SCQ', desc: 'When was the last time you used [product]?' },
                                            { id: 'us_q2', label: 'Usage Frequency', type: 'SCQ', desc: 'How often do you typically use [product]?' },
                                            { id: 'us_q3', label: 'Usage Timing', type: 'MCQ', desc: 'At what time of the day do you use [product]?' },
                                            { id: 'us_q4', label: 'Usage Occasion', type: 'MCQ', desc: 'On what occasions do you typically use [product]?' },
                                        ].map(q => {
                                            const isSelected = (usageConfig.selected_questions || ['us_q1', 'us_q2', 'us_q3', 'us_q4']).includes(q.id);
                                            return (
                                                <button
                                                    key={q.id}
                                                    onClick={() => {
                                                        const current = usageConfig.selected_questions || ['us_q1', 'us_q2', 'us_q3', 'us_q4'];
                                                        const next = current.includes(q.id)
                                                            ? current.filter(id => id !== q.id)
                                                            : [...current, q.id];
                                                        updateUsage({ selected_questions: next });
                                                    }}
                                                    className={`group/q p-5 rounded-[2rem] border-2 text-left transition-all relative overflow-hidden ${isSelected
                                                        ? 'bg-surface border-primary shadow-lg shadow-primary/5'
                                                        : 'bg-slate-50/50 dark:bg-slate-950 border-line/80 dark:border-line/10 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 hover:border-slate-300'
                                                        }`}
                                                >
                                                    <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[8px] font-black transition-colors px-2 py-0.5 rounded-full uppercase ${isSelected ? 'text-primary-soft bg-primary/10' : 'text-slate-400 bg-surface-sunken'}`}>{q.id}</span>
                                                                <span className="text-[8px] font-black text-slate-400 bg-surface-sunken px-2 py-0.5 rounded-full uppercase">{q.type}</span>
                                                            </div>
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-primary bg-primary text-white' : 'border-slate-200'}`}>
                                                                {isSelected && <Check className="w-3 h-3" />}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <p className={`text-[10px] font-black transition-colors ${isSelected ? 'text-ink' : 'text-slate-500'}`}>{q.label}</p>
                                                            <p className="text-[9px] text-slate-400 leading-snug mt-1">{q.desc.replace('[product]', usageConfig.target_brand || formData.config?.category || '[product]')}</p>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Advanced Logic Controls */}
                                <div className="p-6 rounded-[2.5rem] bg-indigo-500/5 border border-indigo-500/10 space-y-5">
                                    <div className="flex items-center gap-3">
                                        <Zap className="w-4 h-4 text-indigo-500" />
                                        <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Integrated Intelligence</h5>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Auto-Fill Intelligence</label>
                                            <div className="flex p-1 bg-surface-sunken rounded-xl">
                                                <button
                                                    onClick={() => {
                                                        const pfBrands = formData.purchase_funnel?.brand_list || [];
                                                        if (pfBrands.length > 0) {
                                                            updateUsage({ target_brand: pfBrands[0].name_en });
                                                            toast.success(`Synchronized with "${pfBrands[0].name_en}"`);
                                                        } else {
                                                            toast.error("No brands found in Purchase Funnel to sync");
                                                        }
                                                    }}
                                                    className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all bg-white dark:bg-slate-700 text-ink shadow-sm"
                                                >
                                                    Sync First Funnel Brand
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2 text-right">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 text-right block">Survey Blueprint</label>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase leading-relaxed text-right">This module will focus exclusively on the selected brand above for deep-dive diagnostics.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Target Brand Selection */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted block italic">Focus Brand</label>
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-soft transition-colors">
                                            <Palette className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="text"
                                            value={usageConfig.target_brand || ''}
                                            onChange={e => updateUsage({ target_brand: e.target.value })}
                                            placeholder="e.g. Wonder Ville Ice Cream"
                                            className="w-full bg-surface border-2 border-line/80 dark:border-line/10 focus:border-primary rounded-2xl pl-12 pr-6 py-4 text-sm font-black text-ink outline-none transition-all placeholder:text-slate-400/50"
                                        />
                                    </div>
                                </div>

                                {/* Enable/Disable toggle */}
                                <div className="pt-2">
                                    {!usageConfig.target_brand?.trim() ? (
                                        <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-[10px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest text-center">
                                            Please define a focus brand to reach structural threshold
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => updateUsage({ is_enabled: !usageConfig.is_enabled, selected_questions: usageConfig.selected_questions || ['us_q1', 'us_q2', 'us_q3', 'us_q4'] })}
                                            className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl hover:scale-[1.01] active:scale-95 ${usageConfig.is_enabled
                                                ? 'bg-primary text-white shadow-primary/30'
                                                : 'bg-surface text-ink border-2 border-slate-300 dark:border-slate-700'
                                                }`}
                                        >
                                            {usageConfig.is_enabled ? '● Brand Usage Active' : '○ Deploy Brand Usage Module'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ─── Brand Pricing Behavior Module ─── */}
                    <section className="border-t border-line/80 dark:border-line/10 pt-10" id="brand-pricing-section">
                        {!pricingExpanded ? (
                            <button
                                onClick={() => setPricingExpanded(true)}
                                className="w-full flex items-center justify-between px-10 py-7 rounded-[2.5rem] border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="p-3.5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-500 group-hover:bg-primary/10 group-hover:text-primary-soft transition-all">
                                        <Wallet className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-ink">+ Add Purchase Behaviour Module</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Optional · Budget, stocking, channels &amp; pack sizes</p>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-slate-400 group-hover:text-primary-soft transition-colors" />
                            </button>
                        ) : (
                            <div className={`p-10 rounded-[2.5rem] border-2 transition-all duration-300 space-y-8 ${pricingConfig.is_enabled
                                ? 'bg-primary/5 dark:bg-primary/10 border-primary/30'
                                : 'bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-700'
                                }`}>
                                {/* Header */}
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-4 rounded-2xl transition-all ${pricingConfig.is_enabled
                                            ? 'bg-primary text-white shadow-xl shadow-primary/20'
                                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                                            }`}>
                                            <Wallet className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className={`text-lg font-black uppercase tracking-tight ${pricingConfig.is_enabled ? 'text-primary-soft' : 'text-ink'
                                                }`}>Purchase Behaviour Module</h4>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Layer 6 · cb_q1–cb_q4 from question bank</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setPricingExpanded(false);
                                            updatePricing({ is_enabled: false });
                                        }}
                                        className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Question Bank Preview & Selection */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                            <Layers className="w-3 h-3" /> Question Bank Control
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-black text-slate-400 uppercase">Selected:</span>
                                            <span className="text-[8px] font-black text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                                                {(pricingConfig.selected_questions || ['cb_q1', 'cb_q2', 'cb_q3', 'cb_q4']).length}/4
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { id: 'cb_q1', label: 'Monthly Budget', type: 'SCQ', desc: 'What is your typical monthly budget for [product]?' },
                                            { id: 'cb_q2', label: 'Stocking Behavior', type: 'SCQ', desc: 'How do you usually stock [product]?' },
                                            { id: 'cb_q3', label: 'Purchasing Places', type: 'MCQ', desc: 'Where do you usually buy [product]?' },
                                            { id: 'cb_q4', label: 'Pack Sizes', type: 'SCQ', desc: 'What pack size do you usually buy for [product]?' },
                                        ].map(q => {
                                            const isSelected = (pricingConfig.selected_questions || ['cb_q1', 'cb_q2', 'cb_q3', 'cb_q4']).includes(q.id);
                                            return (
                                                <button
                                                    key={q.id}
                                                    onClick={() => {
                                                        const current = pricingConfig.selected_questions || ['cb_q1', 'cb_q2', 'cb_q3', 'cb_q4'];
                                                        const next = current.includes(q.id)
                                                            ? current.filter(id => id !== q.id)
                                                            : [...current, q.id];
                                                        updatePricing({ selected_questions: next });
                                                    }}
                                                    className={`group/q p-5 rounded-[2rem] border-2 text-left transition-all relative overflow-hidden ${isSelected
                                                        ? 'bg-surface border-indigo-500 shadow-lg shadow-indigo-500/5'
                                                        : 'bg-slate-50/50 dark:bg-slate-950 border-line/80 dark:border-line/10 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 hover:border-slate-300'
                                                        }`}
                                                >
                                                    <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[8px] font-black transition-colors px-2 py-0.5 rounded-full uppercase ${isSelected ? 'text-indigo-600 bg-indigo-500/10' : 'text-slate-400 bg-surface-sunken'}`}>{q.id}</span>
                                                                <span className="text-[8px] font-black text-slate-400 bg-surface-sunken px-2 py-0.5 rounded-full uppercase">{q.type}</span>
                                                            </div>
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200'}`}>
                                                                {isSelected && <Check className="w-3 h-3" />}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <p className={`text-[10px] font-black transition-colors ${isSelected ? 'text-ink' : 'text-slate-500'}`}>{q.label}</p>
                                                            <p className="text-[9px] text-slate-400 leading-snug mt-1">{q.desc.replace('[product]', pricingConfig.target_brand || formData.config?.category || '[product]')}</p>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Advanced Logic Controls */}
                                <div className="p-6 rounded-[2.5rem] bg-indigo-500/5 border border-indigo-500/10 space-y-5">
                                    <div className="flex items-center gap-3">
                                        <Zap className="w-4 h-4 text-indigo-500" />
                                        <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Integrated Intelligence</h5>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Auto-Fill Intelligence</label>
                                            <div className="flex p-1 bg-surface-sunken rounded-xl">
                                                <button
                                                    onClick={() => {
                                                        const pfBrands = formData.purchase_funnel?.brand_list || [];
                                                        if (pfBrands.length > 0) {
                                                            updatePricing({ target_brand: pfBrands[0].name_en });
                                                            toast.success(`Synchronized with "${pfBrands[0].name_en}"`);
                                                        } else {
                                                            toast.error("No brands found in Purchase Funnel to sync");
                                                        }
                                                    }}
                                                    className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all bg-white dark:bg-slate-700 text-ink shadow-sm"
                                                >
                                                    Sync First Funnel Brand
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2 text-right">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 text-right block">Financial Blueprint</label>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase leading-relaxed text-right">This module will focus exclusively on the price perception of the selected brand.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Target Brand Selection */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted block italic">Target Brand</label>
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-soft transition-colors">
                                            <Palette className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="text"
                                            value={pricingConfig.target_brand || ''}
                                            onChange={e => updatePricing({ target_brand: e.target.value })}
                                            placeholder="e.g. Wonder Ville Ice Cream"
                                            className="w-full bg-surface border-2 border-line/80 dark:border-line/10 focus:border-primary rounded-2xl pl-12 pr-6 py-4 text-sm font-black text-ink outline-none transition-all placeholder:text-slate-400/50"
                                        />
                                    </div>
                                </div>

                                {/* Enable/Disable toggle */}
                                <div className="pt-2">
                                    {!pricingConfig.target_brand?.trim() ? (
                                        <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-[10px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest text-center">
                                            Please define a focus brand to reach structural threshold
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => updatePricing({ is_enabled: !pricingConfig.is_enabled, selected_questions: pricingConfig.selected_questions || ['cb_q1', 'cb_q2', 'cb_q3', 'cb_q4'] })}
                                            className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl hover:scale-[1.01] active:scale-95 ${pricingConfig.is_enabled
                                                ? 'bg-primary text-white shadow-primary/30'
                                                : 'bg-surface text-ink border-2 border-slate-300 dark:border-slate-700'
                                                }`}
                                        >
                                            {pricingConfig.is_enabled ? '● Purchase Behaviour Active' : '○ Deploy Purchase Behaviour Module'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ─── Brand Analyzer Module (L7) ─── */}
                    <section className="border-t border-line/80 dark:border-line/10 pt-10" id="brand-analyzer-section">
                        {!baExpanded ? (
                            <button
                                onClick={() => setBaExpanded(true)}
                                className="w-full flex items-center justify-between px-10 py-7 rounded-[2.5rem] border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="p-3.5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-500 group-hover:bg-primary/10 group-hover:text-primary-soft transition-all">
                                        <Zap className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-ink">+ Add Brand Analyzer Module</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Advanced Analytics · CBI, POP/POD & Performance Matrix</p>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-slate-400 group-hover:text-primary-soft transition-colors" />
                            </button>
                        ) : (
                            <div className={`p-10 rounded-[2.5rem] border-2 transition-all duration-300 space-y-8 ${baConfig.is_enabled
                                ? 'bg-primary/5 dark:bg-primary/10 border-primary/30'
                                : 'bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-700'
                                }`}>

                                {/* Header */}
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-4 rounded-2xl transition-all ${baConfig.is_enabled
                                            ? 'bg-primary text-white shadow-xl shadow-primary/20'
                                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                                            }`}>
                                            <Zap className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className={`text-lg font-black uppercase tracking-tight ${baConfig.is_enabled ? 'text-primary-soft' : 'text-ink'
                                                }`}>Brand Analyzer module</h4>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Strategic Equity & Attribute Perception Analysis</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setBaExpanded(false);
                                            updateBA({ is_enabled: false });
                                        }}
                                        className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Smart Sync Switch */}
                                <div className="bg-surface p-6 rounded-3xl border border-line/80 dark:border-line/10 flex items-center justify-between group shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3.5 rounded-2xl bg-primary/10 text-primary-soft group-hover:bg-primary group-hover:text-white transition-all">
                                            <ShieldCheck className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-ink">Sync with Purchase Funnel</p>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">Automatically link brand awareness (L4) to perception grids (L7)</p>
                                        </div>
                                    </div>
                                    <div
                                        onClick={() => updateBA({ sync_with_purchase_funnel: !baConfig.sync_with_purchase_funnel })}
                                        className={`w-12 h-6 rounded-full relative cursor-pointer transition-all ${baConfig.sync_with_purchase_funnel ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-800'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${baConfig.sync_with_purchase_funnel ? 'right-1' : 'left-1'}`} />
                                    </div>
                                </div>

                                {/* Attribute Bank Interaction */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between bg-surface shadow-sm border border-line/80 dark:border-line/10 p-4 rounded-2xl">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-primary/10 text-primary-soft">
                                                <Layers className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-black uppercase tracking-[0.1em] text-ink">Attribute Selection Bank</span>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Select high-impact image attributes for analysis</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={fetchBrandBank}
                                                className="p-2 rounded-xl bg-surface-raised text-slate-400 hover:text-primary-soft transition-all"
                                                title="Refresh Bank"
                                            >
                                                <motion.div whileHover={{ rotate: 180 }} transition={{ duration: 0.5 }}>
                                                    <Settings2 className="w-4 h-4" />
                                                </motion.div>
                                            </button>
                                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
                                            <span className="text-[9px] font-black text-primary-soft bg-primary/10 px-4 py-1.5 rounded-full uppercase tracking-widest border border-primary/20">
                                                {baConfig.selected_attributes.length} ACTIVE
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {(brandImageBank?.attributes || []).map((attr: any, idx: number) => {
                                            const isSelected = baConfig.selected_attributes.includes(attr.id);
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => {
                                                        const nextAttrs = isSelected
                                                            ? baConfig.selected_attributes.filter((a: string) => a !== attr.id)
                                                            : [...baConfig.selected_attributes, attr.id];
                                                        updateBA({ selected_attributes: nextAttrs });
                                                    }}
                                                    className={`p-4 rounded-2xl border-2 text-left transition-all group flex flex-col justify-between h-28 ${isSelected
                                                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                                                        : 'bg-surface border-line/80 dark:border-line/10 text-ink hover:border-primary/30'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-white/20' : 'bg-surface-sunken text-slate-400'}`}>
                                                            {attr.category === 'innovation' ? <Zap className="w-3 h-3" /> :
                                                                attr.category === 'value' ? <Wallet className="w-3 h-3" /> :
                                                                    attr.category === 'quality' ? <ShieldCheck className="w-3 h-3" /> :
                                                                        <Palette className="w-3 h-3" />}
                                                        </div>
                                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-white' : 'border-slate-200'}`}>
                                                            {isSelected && <Check className="w-2.5 h-2.5" />}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-tight leading-tight">
                                                            {formData.config?.language === 'ar' ? attr.label_ar : attr.label_en}
                                                        </p>
                                                        <p className={`text-[8px] font-bold uppercase mt-1 ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
                                                            {attr.category}
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {/* Proprietary Attributes Input */}
                                        <div className="p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-3 transition-all bg-slate-50/50 dark:bg-slate-900/50 min-h-[7rem]">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">Add Custom Attribute</span>

                                            <div className="flex gap-2 w-full">
                                                <input
                                                    type="text"
                                                    value={baCustomAttrInput}
                                                    onChange={e => setBaCustomAttrInput(e.target.value)}
                                                    placeholder="Type attribute..."
                                                    className="flex-1 bg-surface border border-line/80 dark:border-line/10 rounded-xl px-3 py-1.5 text-[10px] font-bold outline-none focus:border-primary transition-all"
                                                    onKeyPress={e => {
                                                        if (e.key === 'Enter' && baCustomAttrInput.trim()) {
                                                            const newAttr = {
                                                                id: `custom_${Date.now()}`,
                                                                label_en: baCustomAttrInput.trim(),
                                                                label_ar: baCustomAttrInput.trim(),
                                                                category: 'custom',
                                                                is_custom: true
                                                            };
                                                            updateBA({
                                                                custom_attributes: [...(baConfig.custom_attributes || []), newAttr],
                                                                selected_attributes: [...baConfig.selected_attributes, newAttr.id]
                                                            });
                                                            setBaCustomAttrInput('');
                                                            toast.success(`Custom attribute "${newAttr.label_en}" added`);
                                                        }
                                                    }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (!baCustomAttrInput.trim()) return;
                                                        const newAttr = {
                                                            id: `custom_${Date.now()}`,
                                                            label_en: baCustomAttrInput.trim(),
                                                            label_ar: baCustomAttrInput.trim(),
                                                            category: 'custom',
                                                            is_custom: true
                                                        };
                                                        updateBA({
                                                            custom_attributes: [...(baConfig.custom_attributes || []), newAttr],
                                                            selected_attributes: [...baConfig.selected_attributes, newAttr.id]
                                                        });
                                                        setBaCustomAttrInput('');
                                                        toast.success(`Custom attribute "${newAttr.label_en}" added`);
                                                    }}
                                                    className="p-1.5 bg-primary text-white rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Custom Attributes List */}
                                        {(baConfig.custom_attributes || []).map((attr: any) => {
                                            const isSelected = baConfig.selected_attributes.includes(attr.id);
                                            return (
                                                <button
                                                    key={attr.id}
                                                    onClick={() => {
                                                        const nextAttrs = isSelected
                                                            ? baConfig.selected_attributes.filter((a: string) => a !== attr.id)
                                                            : [...baConfig.selected_attributes, attr.id];
                                                        updateBA({ selected_attributes: nextAttrs });
                                                    }}
                                                    className={`p-4 rounded-2xl border-2 text-left transition-all group flex flex-col justify-between h-28 relative ${isSelected
                                                        ? 'bg-amber-100/50 border-amber-400 text-amber-900 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-100 shadow-lg shadow-amber-200/20'
                                                        : 'bg-surface border-line/80 dark:border-line/10 text-ink hover:border-amber-300'
                                                        }`}
                                                >
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            updateBA({
                                                                custom_attributes: (baConfig.custom_attributes || []).filter((a: any) => a.id !== attr.id),
                                                                selected_attributes: baConfig.selected_attributes.filter((a: string) => a !== attr.id)
                                                            });
                                                        }}
                                                        className="absolute top-2 right-2 p-1 rounded-lg bg-surface-sunken text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all z-20"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-amber-500 text-white' : 'bg-surface-sunken text-slate-400'}`}>
                                                            <Sparkles className="w-3 h-3" />
                                                        </div>
                                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-amber-500' : 'border-slate-200'}`}>
                                                            {isSelected && <Check className="w-2.5 h-2.5 text-amber-600" />}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-tight leading-tight">
                                                            {attr.label_en}
                                                        </p>
                                                        <p className={`text-[8px] font-bold uppercase mt-1 ${isSelected ? 'text-amber-600' : 'text-slate-400'}`}>
                                                            CUSTOM
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Custom Brand Context (Visible if Sync is off) */}
                                {!baConfig.sync_with_purchase_funnel && (
                                    <div className="space-y-4 p-8 bg-surface-sunken/50 rounded-[2rem] border-2 border-line/80 dark:border-line/10">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h5 className="text-[10px] font-black uppercase tracking-widest text-ink">Manual Brand Context</h5>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">Define brands specifically for equity analysis</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const studyBrands = [
                                                        ...(formData.config?.internal_brands_data || []),
                                                        ...(formData.config?.competitor_brands_data || [])
                                                    ];
                                                    const nextList = studyBrands.map(b => ({
                                                        name: b.name,
                                                        role: b.role || 'competitor'
                                                    }));
                                                    updateBA({ brand_list: nextList });
                                                    toast.success("Synchronized with study brands");
                                                }}
                                                className="px-4 py-2 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl text-[9px] font-black uppercase tracking-widest hover:border-primary hover:text-primary-soft transition-all"
                                            >
                                                Clone Study Brands
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {baConfig.brand_list.map((b, idx) => (
                                                <div key={idx} className="px-4 py-2 bg-surface rounded-xl border border-line/80 dark:border-line/10 flex items-center gap-3">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${b.role === 'internal' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                                    <span className="text-[10px] font-black uppercase tracking-tight text-ink">{b.name}</span>
                                                    <button onClick={() => updateBA({ brand_list: baConfig.brand_list.filter((_, i) => i !== idx) })} className="text-slate-300 hover:text-rose-500"><X size={12} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Validation & Deployment */}
                                <div className="pt-2">
                                    {(baConfig.selected_attributes.length === 0) ? (
                                        <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-[10px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest text-center">
                                            Select at least one attribute to enable the Analyzer
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => updateBA({ is_enabled: !baConfig.is_enabled })}
                                            className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl hover:scale-[1.01] active:scale-95 ${baConfig.is_enabled
                                                ? 'bg-primary text-white shadow-primary/30'
                                                : 'bg-surface text-ink border-2 border-slate-300 dark:border-slate-700'
                                                }`}
                                        >
                                            {baConfig.is_enabled ? '● Brand Analyzer Active' : '○ Deploy Brand Analyzer Module'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {formData.survey_type === 'product_test' && (
                <div className="space-y-12 animate-slide-up">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Category */}
                        <div className="space-y-6 bg-slate-50/50 dark:bg-slate-950/50 p-8 rounded-[2.5rem] border-2 border-line/80 dark:border-line/10 shadow-inner">
                            <div className="flex items-center gap-3 border-b border-line/80 dark:border-line/10 pb-4 mb-2">
                                <Tag className="w-4 h-4 text-primary-soft" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-ink">Product Category</h4>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Survey Category</label>
                                <input
                                    id="config-category-input"
                                    type="text"
                                    value={formData.config?.category || ''}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setFormData(prev => {
                                            const baseConfig = prev.config || DEFAULT_TASTE_CONFIG;
                                            return {
                                                ...prev,
                                                config: { ...baseConfig, category: val }
                                            };
                                        });
                                    }}
                                    placeholder="e.g. Cleansing Foam"
                                    className="w-full bg-surface border-2 border-slate-300 dark:border-slate-700 focus:border-primary rounded-2xl px-6 py-4 text-sm font-bold outline-none dark:text-white transition-all shadow-sm"
                                />
                            </div>
                        </div>

                        {/* Language */}
                        <div className="space-y-6 bg-slate-50/50 dark:bg-slate-950/50 p-8 rounded-[2.5rem] border-2 border-line/80 dark:border-line/10 shadow-inner">
                            <div className="flex items-center gap-3 border-b border-line/80 dark:border-line/10 pb-4 mb-2">
                                <Layers className="w-4 h-4 text-primary-soft" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-ink">Survey Language</h4>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[9.5px] font-black uppercase tracking-widest text-slate-500 ml-1">Translation Locale</label>
                                <div className="flex gap-2">
                                    {['en', 'ar'].map(lang => (
                                        <button
                                            key={lang}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const ptConfig = prev.product_test_config || { ...DEFAULT_PRODUCT_TEST_CONFIG, language: lang as 'en' | 'ar' };
                                                    return {
                                                        ...prev,
                                                        config: { ...(prev.config || DEFAULT_TASTE_CONFIG), language: lang as any },
                                                        product_test_config: { ...ptConfig, language: lang as any }
                                                    };
                                                });
                                            }}
                                            className={`flex-1 py-4 rounded-2xl text-sm font-black transition-all border-2 ${(formData.product_test_config?.language || formData.config?.language || 'en') === lang
                                                ? 'bg-primary border-primary text-white shadow-lg'
                                                : 'bg-surface border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-350 hover:border-primary'}`}
                                        >
                                            {lang.toUpperCase() === 'EN' ? 'English' : 'Arabic / العربية'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ═══ Brand Architecture (shared) ═══ */}
                    {renderSharedProtocolsAndBrands()}

                    {/* ═══ Smart Follow-up Engine ═══ */}
                    {renderSmartFollowupSection()}

                    {/* Product Test Integration Core Component */}
                    <div className="border-t border-line/80 dark:border-line/10 pt-10">
                        <div className="p-10 rounded-[2.5rem] border-4 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/10 space-y-8">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                <div className="flex items-center gap-5 text-left">
                                    <div className="p-4 rounded-2.5xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                                        <Box className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-display font-black text-ink tracking-tight">Product Test Configuration</h4>
                                        <p className="text-xs text-ink-muted font-bold uppercase tracking-wider mt-1">In-home Use sensory mapping and packaging attachment options</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsPtModalOpen(true)}
                                    className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/25 hover:scale-[1.02] active:scale-95 transition-all text-center"
                                >
                                    {formData.product_test_config?.selected_attributes?.length ? 'Modify Configuration' : 'Configure Test Attributes'}
                                </button>
                            </div>

                            {/* Status of Configuration Details */}
                            {formData.product_test_config?.selected_attributes?.length ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left bg-surface p-8 rounded-3xl border-2 border-line/80 dark:border-line/10 shadow-sm transition-colors">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active Sensory Attributes</span>
                                            <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-full">{formData.product_test_config.selected_attributes.length} selected</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {formData.product_test_config.selected_attributes.map(attr => (
                                                <span key={attr} className="text-[10px] font-black tracking-tight bg-surface-sunken text-ink-muted px-3.5 py-2 rounded-xl border border-line/80 dark:border-line/10 shadow-xs">{attr}</span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-850 pt-4 md:pt-0 md:pl-8">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Package Test Attachment</span>
                                            <span className={`text-[9px] font-black px-3 py-1 rounded-full ${formData.product_test_config.package_test_enabled ? 'bg-indigo-500/10 text-indigo-600' : 'bg-slate-150 text-slate-450 dark:bg-slate-900 dark:text-slate-500'}`}>
                                                {formData.product_test_config.package_test_enabled ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                        {formData.product_test_config.package_test_enabled ? (
                                            <div className="space-y-2">
                                                <p className="text-[10px] text-slate-500 font-medium">Selected packaging diagnostics: {formData.product_test_config.package_test_attributes?.length || 0}</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(formData.product_test_config.package_test_attributes || []).map(attr => (
                                                        <span key={attr} className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900/30">{attr}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-450 dark:text-slate-500 font-medium">Packaging evaluation is currently excluded from this survey sequence.</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 bg-amber-500/5 rounded-3xl border border-amber-500/15 text-center">
                                    <p className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">No Custom Attributes Configured</p>
                                    <p className="text-[10px] text-slate-550 dark:text-slate-400 mt-2 font-medium">Fixed questions will still appear in the blueprint. Open the modal to add optional attributes and package evaluation.</p>
                                </div>
                            )}

                            {(() => {
                                const ptConfig = formData.product_test_config || DEFAULT_PRODUCT_TEST_CONFIG;
                                const trialMedia = normalizeTrialMediaCapture(ptConfig.trial_media_capture);
                                const ptLanguage = (ptConfig.language || formData.config?.language || 'en') as 'en' | 'ar';
                                const isArabic = ptLanguage === 'ar';

                                return (
                                    <div
                                        id="trial-media-capture-status"
                                        className="text-left bg-surface p-6 md:p-8 rounded-3xl border-2 border-line/80 dark:border-line/10 shadow-sm transition-colors"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                    Trial Media Upload
                                                </span>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full ${trialMedia.enabled ? 'bg-violet-500/10 text-violet-600' : 'bg-slate-150 text-slate-450 dark:bg-slate-900 dark:text-slate-500'}`}>
                                                    {trialMedia.enabled
                                                        ? (isArabic ? 'مفعّل' : 'Enabled')
                                                        : (isArabic ? 'معطل' : 'Disabled')}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsPtModalOpen(true)}
                                                className="text-[10px] font-black uppercase tracking-widest text-primary-soft hover:underline"
                                            >
                                                {isArabic ? 'تعديل' : 'Configure'}
                                            </button>
                                        </div>

                                        {trialMedia.enabled ? (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                                        {isArabic ? 'نوع الوسائط' : 'Accepted media'}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                        {formatTrialMediaAcceptedLabel(trialMedia.accepted_media, ptLanguage)}
                                                    </p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                                        {isArabic ? 'الإجابة' : 'Response rule'}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                        {trialMedia.required
                                                            ? (isArabic ? 'إلزامي' : 'Required')
                                                            : (isArabic ? 'اختياري' : 'Optional')}
                                                    </p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                                        {isArabic ? 'المرحلة' : 'Timing'}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                        {formatTrialMediaTimingLabel(trialMedia.timing, ptLanguage)}
                                                    </p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                                        {isArabic ? 'حد الفيديو' : 'Video limit'}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                        {trialMedia.max_video_duration_seconds}s
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-ink-muted font-medium">
                                                {isArabic
                                                    ? 'لم يتم تفعيل سؤال رفع الصور/الفيديو. افتح إعدادات اختبار المنتج لتفعيله.'
                                                    : 'Respondents will not be asked to upload trial media. Open Product Test Configuration to enable it.'}
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}

                            <PackagingHeatmapConfigPanel
                                formData={formData}
                                setFormData={setFormData}
                                draftSurveyId={draftSurveyId}
                                pendingFiles={packagingHeatmapPending}
                                onPendingFilesChange={onPackagingHeatmapPendingChange}
                            />

                            {(formData.product_test_config || ptBankCache.length > 0) && ptBankCache.length > 0 && (
                                <ProductTestL2PreviewPanel
                                    config={formData.product_test_config || DEFAULT_PRODUCT_TEST_CONFIG}
                                    productBank={ptBankCache}
                                    packageBank={pkgBankCache}
                                    brandContextInput={resolveBrandContextFromFormConfig(formData.config)}
                                    defaultExpanded={Boolean(
                                        formData.product_test_config?.selected_attributes?.length
                                        || formData.product_test_config?.package_test_enabled
                                        || formData.product_test_config?.trial_media_capture?.enabled
                                    )}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {formData.survey_type !== 'taste_test' && formData.survey_type !== 'product_test' && formData.survey_type !== '' && (
                <div className="p-20 flex flex-col items-center justify-center text-center space-y-6 bg-surface-raised/40 rounded-[3rem] border border-dashed border-line/80 dark:border-line/10 transition-colors">
                    <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-900 flex items-center justify-center text-slate-400 dark:text-slate-700 transition-colors">
                        <Settings2 className="w-8 h-8" />
                    </div>
                    <div className="space-y-2 transition-colors">
                        <h4 className="text-xl font-display font-black text-ink transition-colors">Module Under Construction</h4>
                        <p className="text-sm text-ink-subtle font-medium max-w-sm mx-auto transition-colors">The automated generator for <span className="text-ink font-bold">{(formData.survey_type as string)?.replace('_', ' ')}</span> is being finalized.</p>
                    </div>
                    <button
                        onClick={() => {
                            const mockSchema = {
                                layer1_structure: { sections: [] },
                                layer2_structure: { sections: [{ title: 'Main Evaluation', questions: [{ id: 'q1', type: 'text', label: 'Initial Impressions' }] }] }
                            };
                            setFormData(prev => ({
                                ...prev,
                                schema: mockSchema
                            }));
                            if (nextStep) nextStep();
                        }}
                        className="px-6 py-3 bg-surface text-ink border border-line/80 dark:border-line/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm"
                    >
                        Use Standard Template
                    </button>
                </div>
            )}

            <ProductTestConfigModal
                isOpen={isPtModalOpen}
                onClose={() => setIsPtModalOpen(false)}
                onConfirm={(conf, context) => {
                    applyProductTestConfig(conf, {
                        productBank: context?.productBank,
                        packageBank: context?.packageBank,
                    });
                    setIsPtModalOpen(false);
                }}
                initialConfig={formData.product_test_config}
            />
        </div>
    );
}
