import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, Reorder } from 'framer-motion';
import {
    Plus, Layers, GripHorizontal,
    Shield, Info, ShieldCheck,
    Lock, Zap, Edit3
} from 'lucide-react';
import { StepProps } from '../types';
import QuestionBlock from '../../../components/TemplateEditor/QuestionBlock';
import { toast } from 'sonner';
import type { QuestionModule } from '../../../types/questionModules';
import { fetchPurchaseFunnelModule } from '../../../utils/purchaseFunnelModuleUtils';
import { fetchBrandUsageModule } from '../../../utils/brandUsageModuleUtils';
import { fetchBrandPricingBehaviorModule } from '../../../utils/brandPricingBehaviorModuleUtils';
import { formatModuleQuestionText } from '../../../utils/moduleQuestionUtils';
import { resolveModuleSequence, isSurveyModuleEnabled, SURVEY_MODULE_REGISTRY } from '../../../constants/surveyModules';
import { productTestQuestions } from '../../../services/api';
import {
    buildProductTestBlueprintSnapshot,
    resolveLayerEmptyDiagnostic,
} from '../../../utils/architectStepDiagnostics';
import type { ProductTestBankStatusSnapshot } from '../../../utils/blueprintGenerationGuards';
import {
    flattenSnapshotForArchitectPreview,
    patchProductTestSnapshotQuestion,
    resolveBlueprintProductTestSnapshot,
    snapshotHasBlueprintContent,
} from '../../../utils/productTestBlueprintUtils';
import { BlueprintLayerEmptyState } from '../components/BlueprintLayerEmptyState';
import { ProductTestBlueprintStatusBar } from '../components/ProductTestBlueprintStatusBar';
import { canEditStructuralBlueprint, isBlueprintLayerReadOnly } from '../../../utils/structuralBlueprintPermissions';

export function ArchitectStep({ formData, setFormData, handleGenerateSchema, loading = false }: StepProps) {
    const blueprintEditable = canEditStructuralBlueprint(localStorage.getItem('role'));
    // Auto-select the correct active layer based on survey type
    const [activeLayer, setActiveLayer] = useState<string>(
        formData.survey_type === 'product_test' ? 'product_test' : 'screening'
    );
    const [customRatingsCount, setCustomRatingsCount] = useState(0);
    const [pfModule, setPfModule] = useState<QuestionModule | null>(null);
    const [usageModule, setUsageModule] = useState<QuestionModule | null>(null);
    const [pricingModule, setPricingModule] = useState<QuestionModule | null>(null);

    const baseSeq = resolveModuleSequence(formData);
    // Determine which core evaluation module to force-include based on survey type
    const coreModule = formData.survey_type === 'product_test' ? 'product_test' : 'taste_test';
    const fullSeq = Array.from(new Set(['screening', ...baseSeq, coreModule, 'premium']))
        .filter(modId => {
            // Screening is always required; the active core module + Premium are always shown
            if (modId === 'screening' || modId === 'premium') return true;
            // The core evaluation module for this survey type is always shown
            if (modId === coreModule) return true;
            // Don't show the other core module (e.g. taste_test on a product_test survey)
            if (modId === 'taste_test' && formData.survey_type === 'product_test') return false;
            if (modId === 'product_test' && formData.survey_type === 'taste_test') return false;
            // Configurable modules must be explicitly enabled
            return isSurveyModuleEnabled(modId, formData);
        });

    // Lock screening but allow others to be reordered
    const [moduleSeq, setModuleSeq] = useState(fullSeq.filter(m => m !== 'screening'));
    const pfCategory = formData.purchase_funnel?.category_name || formData.config?.category || '';
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [bankStatus, setBankStatus] = useState<ProductTestBankStatusSnapshot | null>(null);
    const [bankStatusLoading, setBankStatusLoading] = useState(formData.survey_type === 'product_test');

    const isGenerating = loading || isRefreshing;
    const ptBlueprintSnapshot = useMemo(
        () => buildProductTestBlueprintSnapshot(formData),
        [formData],
    );

    const fetchBankStatus = useCallback(async () => {
        if (formData.survey_type !== 'product_test') return;
        setBankStatusLoading(true);
        try {
            const status = await productTestQuestions.getBankStatus();
            setBankStatus(status);
        } catch {
            setBankStatus(null);
        } finally {
            setBankStatusLoading(false);
        }
    }, [formData.survey_type]);

    useEffect(() => {
        fetchBankStatus();
    }, [fetchBankStatus]);

    const handleRefreshBlueprint = useCallback(async () => {
        if (!handleGenerateSchema || isGenerating) return;
        setIsRefreshing(true);
        try {
            await handleGenerateSchema();
            await fetchBankStatus();
        } finally {
            setIsRefreshing(false);
        }
    }, [handleGenerateSchema, isGenerating, fetchBankStatus]);

    // Draft recovery: auto-regenerate once when product test snapshot is empty on mount
    const autoRegenerateAttempted = useRef(false);
    useEffect(() => {
        if (autoRegenerateAttempted.current) return;
        if (formData.survey_type !== 'product_test') return;
        if (!handleGenerateSchema) return;

        const snapshot = resolveBlueprintProductTestSnapshot(formData);
        if (snapshotHasBlueprintContent(snapshot)) return;

        autoRegenerateAttempted.current = true;
        handleRefreshBlueprint();
    }, [formData, handleRefreshBlueprint]);

    useEffect(() => {
        if (isSurveyModuleEnabled('purchase_funnel', formData)) {
            fetchPurchaseFunnelModule().then(setPfModule).catch(() => toast.error('Could not load purchase funnel module'));
        }
        if (isSurveyModuleEnabled('brand_usage', formData)) {
            fetchBrandUsageModule().then(setUsageModule).catch(() => toast.error('Could not load brand usage module'));
        }
        if (isSurveyModuleEnabled('brand_pricing_behavior', formData)) {
            fetchBrandPricingBehaviorModule().then(setPricingModule).catch(() => toast.error('Could not load pricing behavior module'));
        }
    }, [formData]);

    const handleAddQuestion = (sectionIdx: number, layer: 1 | 2) => {
        const newQ = { id: `q_${Date.now()}`, label: 'New Question', type: 'text', required: true, questionMeta: { nature: 'OPEN' } };
        setFormData(prev => {
            const newSchema = JSON.parse(JSON.stringify(prev.schema));
            const targetLayer = layer === 1 ? 'layer1_structure' : 'layer2_structure';
            if (newSchema[targetLayer]?.sections?.[sectionIdx]) {
                newSchema[targetLayer].sections[sectionIdx].questions = [...(newSchema[targetLayer].sections[sectionIdx].questions || []), newQ];
            }
            return { ...prev, schema: newSchema };
        });
    };

    const syncL3toL2 = (l3Questions: any[], schema: any) => {
        if (!schema?.layer2_structure?.sections) return;

        schema.layer2_structure.sections = schema.layer2_structure.sections.map((section: any) => {
            const title = section.title || '';
            if (!(title.includes('General Evaluation') || title.includes('تقييم عام'))) {
                return section;
            }

            const currentQuestions = Array.isArray(section.questions) ? section.questions : [];
            const filteredQuestions = currentQuestions.filter((q: any) => !q.isL3Custom);

            const clones = (l3Questions || []).map((q: any) => ({
                ...q,
                id: `${q.id || 'q'}_${section.brand || 'global'}`,
                isL3Custom: true,
                questionMeta: {
                    ...(q.questionMeta || {}),
                    nature: 'fixed'
                }
            }));

            return {
                ...section,
                questions: [...clones, ...filteredQuestions]
            };
        });
    };

    const handleReorderSequence = (newSeq: string[]) => {
        setModuleSeq(newSeq);
        setFormData(prev => ({
            ...prev,
            module_sequence: ['screening', ...newSeq]
        }));
        toast.success('Survey sequence updated effectively.');
    };

    const handleAddCustomRatingL3 = () => {
        if (customRatingsCount >= 3) {
            toast.error('Maximum of 3 custom rating questions allowed.');
            return;
        }

        setFormData(prev => {
            const newSchema = JSON.parse(JSON.stringify(prev.schema));
            if (!newSchema.layer3_structure?.sections?.length) {
                newSchema.layer3_structure = { sections: [{ title: 'Premium Metrics', questions: [] }] };
            }

            const newQId = `custom_rating_${Date.now()}`;
            const newQ = {
                id: newQId,
                label: 'New Custom Premium Rating',
                text: 'New Custom Premium Rating',
                type: 'scale',
                required: true,
                questionMeta: {
                    nature: 'dynamic',
                    inputType: 'scale',
                    scaleMax: 10,
                    minLabel: 'Dislike Extremely',
                    maxLabel: 'Like Extremely'
                }
            };

            newSchema.layer3_structure.sections[0].questions.push(newQ);
            syncL3toL2(newSchema.layer3_structure.sections[0].questions, newSchema);
            return { ...prev, schema: newSchema };
        });

        setCustomRatingsCount(prev => prev + 1);
        toast.success('Custom rating added to Layer 3 and synced visually to Layer 2.');
    };

    const getModuleQuestions = (mod: QuestionModule | null) => {
        if (!mod) return [];
        return mod.sections.flatMap((section) =>
            (section.questions || []).map((q) => ({
                ...q,
                sectionTitle: section.title_en,
            }))
        );
    };

    const getLayerLabel = (modId: string) => {
        if (modId === 'screening') return 'L1';
        if (modId === 'taste_test' || modId === 'product_test') return 'L2';
        if (modId === 'premium') return 'L3';
        if (modId === 'purchase_funnel') return 'L4';
        if (modId === 'brand_usage') return 'L5';
        if (modId === 'brand_pricing_behavior') return 'L6';
        if (modId === 'brand_analyzer') return 'L7';
        return 'L?';
    };

    const getLayerMiniLabel = (modId: string) => {
        if (modId === 'screening') return 'Screening';
        if (modId === 'taste_test') return 'Taste Test';
        if (modId === 'product_test') return 'Product Test';
        if (modId === 'purchase_funnel') return 'Purchase';
        if (modId === 'brand_usage') return 'Usage';
        if (modId === 'brand_pricing_behavior') return 'Purchase';
        if (modId === 'brand_analyzer') return 'Equity';
        return modId;
    };

    return (
        <div className="animate-slide-up">
            <div className="max-w-6xl mx-auto">
                {/* Pure Architecture Workstation */}
                <div className="space-y-6">
                    <div className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-card bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-[3rem] p-6 border border-white/20 dark:border-slate-700/50 shadow-premium flex flex-col md:flex-row md:items-center justify-between gap-5"
                        >
                            <div className="flex items-center gap-6">
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-brand-accent/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500" />
                                    <div className="relative p-5 rounded-3xl bg-gradient-to-br from-brand-accent to-brand-glow text-white shadow-xl shadow-brand-accent/20">
                                        <Zap className="w-7 h-7" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-display font-black text-ink tracking-tight">
                                        Architectural <span className="text-brand-accent">Blueprint</span>
                                    </h3>
                                    <p className="text-xs text-ink-muted font-bold uppercase tracking-[0.2em] mt-1">
                                        Engineering the respondent experience layer by layer
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 px-6 py-4 bg-slate-900/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                                <div className="text-right">
                                    <p className="text-sm font-black uppercase tracking-widest text-slate-400">Total Logic Phases</p>
                                    <p className="text-xl font-display font-black text-ink">{moduleSeq.length + 1}</p>
                                </div>
                                <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-2" />
                                <div className="flex -space-x-2">
                                    {moduleSeq.map((m, i) => (
                                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-800 bg-primary flex items-center justify-center text-sm font-bold text-white shadow-sm">
                                            {getLayerLabel(m)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>

                        {formData.survey_type === 'product_test' && (
                            <ProductTestBlueprintStatusBar
                                snapshot={ptBlueprintSnapshot}
                                isGenerating={isGenerating}
                            />
                        )}

                        {/* Respondent Journey Roadmap (The Architecture Circuit) */}
                        <div className="relative glass-card bg-slate-900/[0.02] dark:bg-white/[0.02] rounded-[3.5rem] p-4 border border-line/80 dark:border-line/10 overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-blue/30 to-transparent" />

                            <div className="p-5">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                        <h4 className="text-sm font-black uppercase tracking-[0.4em] text-ink">Live Architecture Flow</h4>
                                    </div>
                                    <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-black text-emerald-500 uppercase tracking-widest">
                                        Status: Constructing Sequence
                                    </div>
                                </div>

                                <div className="flex items-center justify-between relative px-6">
                                    {/* The Advanced Flow Line */}
                                    <div className="absolute top-[32px] left-20 right-20 h-[1.5px] bg-slate-200 dark:bg-slate-800">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-primary via-brand-glow to-brand-accent"
                                            initial={{ width: 0 }}
                                            animate={{ width: '100%' }}
                                            transition={{ duration: 1.5, ease: "easeInOut" }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between w-full relative">
                                        <div className="relative z-10 flex flex-col items-center gap-6 group/node">
                                            <button
                                                onClick={() => setActiveLayer('screening')}
                                                className={`w-16 h-16 rounded-[1.5rem] flex flex-col items-center justify-center transition-all duration-500 relative ${activeLayer === 'screening'
                                                    ? 'bg-primary text-white shadow-[0_20px_50px_rgba(37,94,145,0.4)] scale-110 -translate-y-2 ring-4 ring-primary/20'
                                                    : 'bg-surface border border-line/80 dark:border-line/10 text-slate-400'
                                                    }`}
                                            >
                                                <Lock className="w-6 h-6 mb-1" />
                                                <span className="text-sm font-black">L1</span>
                                            </button>
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm font-black text-ink uppercase tracking-widest mb-1">Entry</span>
                                                <span className="text-sm font-bold text-slate-400 uppercase tracking-tighter">Locked</span>
                                            </div>
                                        </div>

                                        <Reorder.Group
                                            axis="x"
                                            values={moduleSeq}
                                            onReorder={handleReorderSequence}
                                            className="flex-1 flex items-center justify-around ml-10"
                                        >
                                            {moduleSeq.map((modId) => {
                                                const isFoundation = modId === 'taste_test';
                                                const isEnabled = isFoundation || isSurveyModuleEnabled(modId, formData);
                                                const label = getLayerLabel(modId);
                                                const isActive = activeLayer === modId;

                                                if (!isEnabled && !isFoundation) return null;

                                                return (
                                                    <Reorder.Item
                                                        key={modId}
                                                        value={modId}
                                                        className="relative z-10 flex flex-col items-center gap-6 group/node cursor-grab active:cursor-grabbing"
                                                    >
                                                        <button
                                                            onClick={() => setActiveLayer(modId)}
                                                            className={`w-16 h-16 rounded-[1.5rem] flex flex-col items-center justify-center transition-all duration-500 relative ${isActive
                                                                ? 'bg-primary text-white shadow-[0_20px_50px_rgba(37,94,145,0.4)] scale-110 -translate-y-2 ring-4 ring-primary/20'
                                                                : 'bg-surface border border-line/80 dark:border-line/10 text-slate-400 hover:border-primary/50 hover:text-primary-soft hover:-translate-y-1'
                                                                }`}
                                                        >
                                                            <span className={`text-sm font-black mb-0.5 ${isActive ? 'text-white' : 'text-ink'}`}>{label}</span>
                                                            {isActive && <motion.div layoutId="activeNode" className="absolute -bottom-1.5 w-1.5 h-1.5 bg-white rounded-full" />}

                                                            {/* Legend Indicator */}
                                                            <div className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-lg flex items-center justify-center text-sm border-2 bg-blue-500 border-white dark:border-slate-900 text-white`}>
                                                                <ShieldCheck className="w-2.5 h-2.5" />
                                                            </div>
                                                        </button>

                                                        <div className="text-center space-y-1.5">
                                                            <p className={`text-sm font-black uppercase tracking-widest transition-colors ${isActive ? 'text-primary-soft' : 'text-ink-muted'}`}>
                                                                {getLayerMiniLabel(modId)}
                                                            </p>
                                                            <div className={`h-1 w-8 mx-auto rounded-full transition-all duration-500 ${isActive ? 'bg-primary w-12' : 'bg-slate-200 dark:bg-slate-700'}`} />
                                                        </div>
                                                    </Reorder.Item>
                                                );
                                            })}
                                        </Reorder.Group>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6 pb-24">
                            {(() => {
                                // ─── Module-Specific Rendering (Generic/Protected Modules) ───
                                const isGenericModule = ['purchase_funnel', 'brand_usage', 'brand_pricing_behavior'].includes(activeLayer);
                                if (isGenericModule) {
                                    let mod: QuestionModule | null = null;
                                    let focusLabel = '';
                                    if (activeLayer === 'purchase_funnel') { mod = pfModule; focusLabel = pfCategory; }
                                    if (activeLayer === 'brand_usage') { mod = usageModule; focusLabel = formData.brand_usage?.target_brand || formData.config?.category || 'Category'; }
                                    if (activeLayer === 'brand_pricing_behavior') { mod = pricingModule; focusLabel = formData.brand_pricing_behavior?.target_brand || formData.config?.category || 'Category'; }
                                    if (activeLayer === 'brand_analyzer') { focusLabel = formData.brand_analyzer?.brand_list?.[0]?.name || formData.config?.category || 'Brand'; }

                                    const qs = getModuleQuestions(mod);

                                    return (
                                        <section key={activeLayer} className="space-y-6 animate-in fade-in slide-in-from-right-4">

                                            <div className="grid grid-cols-1 gap-5">
                                                {qs.map((q, idx) => (
                                                    <motion.div
                                                        key={q.question_id}
                                                        initial={{ opacity: 0, x: 20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: idx * 0.05 }}
                                                        className="group relative bg-surface p-6 rounded-[3rem] border-2 border-line/80 dark:border-line/10 transition-all hover:border-primary/40 shadow-sm text-left flex flex-col md:flex-row gap-5 items-start"
                                                    >
                                                        <div className="w-14 h-14 shrink-0 flex flex-col items-center justify-center bg-surface-raised rounded-2xl border border-line/80 dark:border-line/10">
                                                            <span className="text-xs font-black text-primary-soft">Q{idx + 1}</span>
                                                        </div>

                                                        <div className="flex-1 space-y-6">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-sm font-black text-primary-soft uppercase tracking-widest px-4 py-1.5 bg-primary/5 rounded-full border border-primary/15">
                                                                    {q.sectionTitle}
                                                                </span>
                                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
                                                                    <Layers className="w-3 h-3" />
                                                                    {q.type.replace('_', ' ')} logic
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                                        <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">English Instrumentation</p>
                                                                    </div>
                                                                    <p className="text-lg font-display font-medium text-ink leading-snug">
                                                                        {formatModuleQuestionText(q.en_text, { product: focusLabel, category: focusLabel })}
                                                                    </p>
                                                                </div>
                                                                <div className="space-y-2 text-right border-t lg:border-t-0 lg:border-l border-line/80 dark:border-line/10 pt-6 lg:pt-0 lg:pl-10">
                                                                    <div className="flex items-center justify-end gap-2 mb-2">
                                                                        <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">المحتوى البحثي العربي</p>
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                                    </div>
                                                                    <p className="text-xl font-display font-medium text-ink leading-relaxed" dir="rtl">
                                                                        {formatModuleQuestionText(q.ar_text, { product: focusLabel, category: focusLabel })}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="absolute top-6 right-6 flex items-center gap-2">
                                                            <div className="p-2 bg-surface-raised rounded-xl border border-line/80 dark:border-line/10">
                                                                <Shield className="w-4 h-4 text-slate-300" />
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </section>
                                    );
                                }

                                // ─── L3 Premium Metrics Rendering ───
                                if (activeLayer === 'premium') {
                                    return (
                                        <motion.div
                                            key="premium-view"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="space-y-6"
                                        >
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 glass-card bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-[2.5rem] border-2 border-emerald-500/20 shadow-xl">
                                                <div className="flex items-center gap-6">
                                                    <div className="p-5 bg-emerald-500 text-white rounded-3xl shadow-lg shadow-emerald-500/20">
                                                        <Zap className="w-8 h-8" />
                                                    </div>
                                                    <div className="text-left">
                                                        <h3 className="text-xl font-display font-black text-emerald-600 flex items-center gap-2">
                                                            Premium Performance Metrics
                                                        </h3>
                                                        <p className="text-sm font-black text-emerald-500 uppercase tracking-widest mt-1 opacity-80">
                                                            Proprietary instrumentation • Max 3 Custom Ratings
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={handleAddCustomRatingL3}
                                                    disabled={customRatingsCount >= 3}
                                                    className={`flex items-center gap-3 px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-[0.2em] transition-all duration-300 ${customRatingsCount >= 3
                                                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                                        : 'bg-emerald-500 text-white shadow-[0_15px_30px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95'
                                                        }`}
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    Add Custom Rating
                                                </button>
                                            </div>

                                            <div className="space-y-6">
                                                {(formData.schema.layer3_structure?.sections?.[0]?.questions || []).map((q: any, qIdx: number) => (
                                                    <QuestionBlock
                                                        key={q.id || qIdx}
                                                        question={q}
                                                        onUpdate={(updated) => {
                                                            setFormData(prev => {
                                                                const newSchema = JSON.parse(JSON.stringify(prev.schema));
                                                                if (newSchema.layer3_structure?.sections?.[0]?.questions) {
                                                                    newSchema.layer3_structure.sections[0].questions[qIdx] = updated;
                                                                    syncL3toL2(newSchema.layer3_structure.sections[0].questions, newSchema);
                                                                }
                                                                return { ...prev, schema: newSchema };
                                                            });
                                                        }}
                                                        onDelete={() => {
                                                            setFormData(prev => {
                                                                const newSchema = JSON.parse(JSON.stringify(prev.schema));
                                                                if (newSchema.layer3_structure?.sections?.[0]?.questions) {
                                                                    newSchema.layer3_structure.sections[0].questions.splice(qIdx, 1);
                                                                    syncL3toL2(newSchema.layer3_structure.sections[0].questions, newSchema);
                                                                }
                                                                return { ...prev, schema: newSchema };
                                                            });
                                                            setCustomRatingsCount(prev => Math.max(0, prev - 1));
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </motion.div>
                                    );
                                }

                                // ─── Standard Architecture Layers (L1/L2/L7) ───
                                let sections: any[] = [];
                                if (activeLayer === 'screening') {
                                    sections = formData.schema.layer1_structure?.sections || [];
                                } else if (activeLayer === 'product_test') {
                                    const snapshot = resolveBlueprintProductTestSnapshot(formData.schema);
                                    sections = snapshotHasBlueprintContent(snapshot)
                                        ? flattenSnapshotForArchitectPreview(snapshot!)
                                        : (formData.schema.layer2_structure?.sections || []);
                                } else if (activeLayer === 'taste_test') {
                                    sections = formData.schema.layer2_structure?.sections || [];
                                } else {
                                    const layerKey = SURVEY_MODULE_REGISTRY[activeLayer]?.schemaLayer;
                                    if (layerKey) sections = (formData.schema as any)[layerKey]?.sections || [];
                                }

                                if (sections.length === 0) {
                                    const diagnostic = resolveLayerEmptyDiagnostic(
                                        activeLayer,
                                        formData,
                                        bankStatus,
                                        bankStatusLoading,
                                    );
                                    return (
                                        <BlueprintLayerEmptyState
                                            key={`empty-${activeLayer}`}
                                            diagnostic={diagnostic}
                                            onRefresh={handleGenerateSchema ? handleRefreshBlueprint : undefined}
                                            isRefreshing={isGenerating}
                                        />
                                    );
                                }

                                return (
                                    <Reorder.Group
                                        key={activeLayer}
                                        axis="y"
                                        values={sections}
                                        onReorder={(newSections) => {
                                            if (activeLayer === 'product_test') return;
                                            setFormData(prev => {
                                                const newSchema = JSON.parse(JSON.stringify(prev.schema));
                                                const targetLayer = activeLayer === 'screening' ? 'layer1_structure' :
                                                    (activeLayer === 'taste_test' || activeLayer === 'product_test') ? 'layer2_structure' :
                                                        SURVEY_MODULE_REGISTRY[activeLayer]?.schemaLayer || 'layer2_structure';
                                                if (newSchema[targetLayer]) {
                                                    newSchema[targetLayer].sections = newSections;
                                                }
                                                return { ...prev, schema: newSchema };
                                            });
                                        }}
                                        className="space-y-16"
                                    >
                                        {sections.map((section: any, sIdx: number) => (
                                            <Reorder.Item key={section.title || sIdx} value={section} className="relative space-y-6 bg-slate-50/50 dark:bg-slate-900/10 p-6 rounded-[2.5rem] border border-transparent hover:border-slate-200 dark:hover:border-slate-800 transition-all group/section">
                                                <div className="absolute -left-8 top-6 opacity-0 group-hover/section:opacity-100 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-700 hover:text-primary-soft transition-all hidden md:block">
                                                    {activeLayer !== 'product_test' && (
                                                        <GripHorizontal className="w-5 h-5 rotate-90" />
                                                    )}
                                                </div>
                                                {activeLayer === 'taste_test' && section.title === 'Before Taste' && (
                                                    <div className="flex items-center gap-4 px-6 mb-6">
                                                        <div className="h-px bg-slate-300 dark:bg-slate-700 flex-1" />
                                                        <span className="text-sm font-black uppercase tracking-[0.3em] text-slate-900 dark:text-200">Respondent Priming</span>
                                                        <div className="h-px bg-slate-300 dark:bg-slate-700 flex-1" />
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between px-8 py-3 bg-surface/50 rounded-2xl border border-line/80 dark:border-line/10 shadow-sm">
                                                    <h4 className="text-sm font-black uppercase tracking-[0.3em] text-primary-soft flex items-center gap-3 text-left flex-wrap">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                        {section.title}
                                                        {activeLayer === 'product_test' && section.brand && (
                                                            <span className="text-sm font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                                {section.displayBrand || section.brand}
                                                            </span>
                                                        )}
                                                    </h4>
                                                    {activeLayer === 'screening' ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAddQuestion(sIdx, 1); }}
                                                            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-primary-soft transition-colors group/add"
                                                        >
                                                            <Plus className="w-3.5 h-3.5 group-hover/add:scale-110 transition-transform" /> Add Logic Block
                                                        </button>
                                                    ) : blueprintEditable ? (
                                                        <div className="flex items-center gap-2.5 px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-full border border-emerald-200 dark:border-emerald-800 shadow-inner">
                                                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                                                                <Edit3 className="w-3 h-3 text-emerald-500" /> Editable Copy
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2.5 px-4 py-1.5 bg-surface-raised rounded-full border border-line/80 dark:border-line/10 shadow-inner">
                                                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-900 dark:text-slate-200">
                                                                <Lock className="w-3 h-3 text-emerald-500" /> Layer Fixed
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {section.isInstruction ? (
                                                    <div className="mx-6 p-6 rounded-2xl bg-primary/5 border-2 border-primary/30 flex items-start gap-4 shadow-inner">
                                                        <div className="p-3 bg-primary/10 text-primary-soft rounded-xl shrink-0">
                                                            <Info className="w-5 h-5" />
                                                        </div>
                                                        <div className="space-y-1 text-left">
                                                            <p className="text-xs font-black uppercase tracking-widest text-primary-soft">Respondent Instruction</p>
                                                            <p className="text-sm font-black text-ink leading-relaxed">
                                                                {section.content}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <Reorder.Group
                                                        axis="y"
                                                        values={section.questions || []}
                                                        onReorder={(newQs) => {
                                                            if (activeLayer === 'product_test') return;
                                                            setFormData(prev => {
                                                                const newSchema = JSON.parse(JSON.stringify(prev.schema));
                                                                const targetLayer = activeLayer === 'screening' ? 'layer1_structure' :
                                                                    (activeLayer === 'taste_test' || activeLayer === 'product_test') ? 'layer2_structure' :
                                                                        SURVEY_MODULE_REGISTRY[activeLayer]?.schemaLayer || 'layer2_structure';
                                                                if (newSchema[targetLayer]?.sections?.[sIdx]) {
                                                                    newSchema[targetLayer].sections[sIdx].questions = newQs;
                                                                }
                                                                return { ...prev, schema: newSchema };
                                                            });
                                                        }}
                                                        className="space-y-4"
                                                    >
                                                        {(section.questions || []).map((q: any, qIdx: number) => (
                                                            <Reorder.Item key={q.id || qIdx} value={q} className="relative group/reorder">
                                                                <div className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover/reorder:opacity-100 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-700 hover:text-primary-soft transition-all">
                                                                    {activeLayer !== 'product_test' && (
                                                                        <GripHorizontal className="w-5 h-5 rotate-90" />
                                                                    )}
                                                                </div>
                                                                <QuestionBlock
                                                                    question={q}
                                                                    showGatekeeper={activeLayer === 'screening'}
                                                                    readOnly={isBlueprintLayerReadOnly(activeLayer, localStorage.getItem('role'))}
                                                                    language={formData.config?.language === 'ar' ? 'ar' : 'en'}
                                                                    onUpdate={(updated) => {
                                                                        setFormData(prev => {
                                                                            if (activeLayer === 'product_test') {
                                                                                const snapshot = resolveBlueprintProductTestSnapshot(prev.schema);
                                                                                if (!snapshot) return prev;
                                                                                const questionId = updated.id || q.id;
                                                                                if (!questionId) return prev;
                                                                                return {
                                                                                    ...prev,
                                                                                    schema: {
                                                                                        ...prev.schema,
                                                                                        product_test_snapshot: patchProductTestSnapshotQuestion(
                                                                                            snapshot,
                                                                                            questionId,
                                                                                            updated,
                                                                                        ),
                                                                                    },
                                                                                };
                                                                            }

                                                                            const newSchema = JSON.parse(JSON.stringify(prev.schema));
                                                                            const targetLayer = activeLayer === 'screening' ? 'layer1_structure' :
                                                                                (activeLayer === 'taste_test' || activeLayer === 'product_test') ? 'layer2_structure' :
                                                                                    SURVEY_MODULE_REGISTRY[activeLayer]?.schemaLayer || 'layer2_structure';
                                                                            if (newSchema[targetLayer]?.sections?.[sIdx]?.questions) {
                                                                                newSchema[targetLayer].sections[sIdx].questions[qIdx] = updated;
                                                                            }
                                                                            return { ...prev, schema: newSchema };
                                                                        });
                                                                    }}
                                                                    onDelete={q.questionMeta?.nature === 'fixed' ? undefined : () => {
                                                                        setFormData(prev => {
                                                                            const newSchema = JSON.parse(JSON.stringify(prev.schema));
                                                                            const targetLayer = activeLayer === 'screening' ? 'layer1_structure' :
                                                                                (activeLayer === 'taste_test' || activeLayer === 'product_test') ? 'layer2_structure' :
                                                                                    SURVEY_MODULE_REGISTRY[activeLayer]?.schemaLayer || 'layer2_structure';
                                                                            if (newSchema[targetLayer]?.sections?.[sIdx]?.questions) {
                                                                                newSchema[targetLayer].sections[sIdx].questions.splice(qIdx, 1);
                                                                            }
                                                                            return { ...prev, schema: newSchema };
                                                                        });

                                                                        if (q.type === 'scale' && q.questionMeta?.nature !== 'fixed') {
                                                                            setCustomRatingsCount(prev => Math.max(0, prev - 1));
                                                                        }
                                                                    }}
                                                                />
                                                            </Reorder.Item>
                                                        ))}
                                                    </Reorder.Group>
                                                )}
                                            </Reorder.Item>
                                        ))}
                                    </Reorder.Group>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

