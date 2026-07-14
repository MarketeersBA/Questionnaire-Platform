import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X,
    Sparkles,
    ChevronDown,
    ChevronUp,
    Check,
    Box,
    Layers,
    Info,
    CheckSquare,
    Square,
    Camera,
} from 'lucide-react';
import { ProductTestConfig, ProductTestQuestion, PackageTestQuestion } from '../types/productTest';
import { productTestQuestions } from '../services/api';
import {
    DEFAULT_TRIAL_MEDIA_CAPTURE,
    TRIAL_MEDIA_ACCEPTED_OPTIONS,
    TRIAL_MEDIA_CAPTURE_TIMING_OPTIONS,
} from '../utils/trialMediaCaptureConfig';
import {
    buildFinalProductTestConfigWithTrialMedia,
    patchTrialMediaCaptureConfig,
    toggleTrialMediaCaptureEnabled,
} from '../utils/productTestConfigModalTrialMedia';
import { DEFAULT_PRODUCT_TEST_CONFIG } from '../utils/blueprintGenerationGuards';

export interface ProductTestConfigConfirmContext {
    productBank: ProductTestQuestion[];
    packageBank: PackageTestQuestion[];
}

interface ProductTestConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (config: ProductTestConfig, context?: ProductTestConfigConfirmContext) => void;
    initialConfig?: ProductTestConfig | null;
}

export default function ProductTestConfigModal({
    isOpen,
    onClose,
    onConfirm,
    initialConfig,
}: ProductTestConfigModalProps) {
    const [config, setConfig] = useState<ProductTestConfig>({
        ...DEFAULT_PRODUCT_TEST_CONFIG,
        language: 'ar',
    });

    const [ptBank, setPtBank] = useState<ProductTestQuestion[]>([]);
    const [pkgBank, setPkgBank] = useState<PackageTestQuestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Load libraries
    useEffect(() => {
        if (!isOpen) return;

        const loadBanks = async () => {
            setLoading(true);
            try {
                const [ptQs, pkgQs] = await Promise.all([
                    productTestQuestions.listProductQuestions(),
                    productTestQuestions.listPackageQuestions()
                ]);
                setPtBank(ptQs);
                setPkgBank(pkgQs);

                // Auto-expand all main attribute groups by default
                const mainGroups: Record<string, boolean> = {};
                ptQs.forEach((q: ProductTestQuestion) => {
                    const group = q.parent_attribute || (q.attribute_type === 'main' ? q.attribute : 'Overall');
                    mainGroups[group] = true;
                });
                setExpandedGroups(mainGroups);
            } catch (err) {
                console.error(err);
                toast.error('Failed to load product test question banks');
            } finally {
                setLoading(false);
            }
        };

        loadBanks();
    }, [isOpen]);

    // Track config inputs mapping initialConfig
    useEffect(() => {
        if (isOpen && initialConfig) {
            setConfig(withNormalizedTrialMediaCapture(initialConfig));
        } else if (isOpen) {
            setConfig({
                ...DEFAULT_PRODUCT_TEST_CONFIG,
                language: 'ar',
            });
        }
    }, [isOpen, initialConfig]);

    if (!isOpen) return null;

    // Grouping helper
    const groupedAttributes: Record<string, ProductTestQuestion[]> = {};
    ptBank.forEach(q => {
        const key = q.parent_attribute || (q.attribute_type === 'main' ? q.attribute : 'Overall Liking & Standalone');
        if (!groupedAttributes[key]) {
            groupedAttributes[key] = [];
        }
        groupedAttributes[key].push(q);
    });

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [group]: !prev[group]
        }));
    };

    const handleSelectAttribute = (attr: string, isFixed: boolean) => {
        if (isFixed) return; // Can't change fixed

        setConfig(prev => {
            const isSelected = prev.selected_attributes.includes(attr);
            const nextSelected = isSelected
                ? prev.selected_attributes.filter(a => a !== attr)
                : [...prev.selected_attributes, attr];

            // Auto-select/deselect corresponding question IDs
            const relatedQs = ptBank.filter(q => q.attribute === attr && q.question_status !== 'fixed');
            const relatedIds = relatedQs.map(q => q.question_id);

            const nextOptional = isSelected
                ? prev.optional_questions.filter(id => !relatedIds.includes(id))
                : [...prev.optional_questions, ...relatedIds];

            return {
                ...prev,
                selected_attributes: nextSelected,
                optional_questions: nextOptional
            };
        });
    };

    const handleSelectPkgAttribute = (attr: string, isFixed: boolean) => {
        if (isFixed) return;

        setConfig(prev => {
            const isSelected = prev.package_test_attributes.includes(attr);
            const nextSelected = isSelected
                ? prev.package_test_attributes.filter(a => a !== attr)
                : [...prev.package_test_attributes, attr];

            return {
                ...prev,
                package_test_attributes: nextSelected
            };
        });
    };

    const togglePackageTest = () => {
        setConfig(prev => ({
            ...prev,
            package_test_enabled: !prev.package_test_enabled
        }));
    };

    const trialMedia = config.trial_media_capture ?? DEFAULT_TRIAL_MEDIA_CAPTURE;
    const isArabic = config.language === 'ar';

    const toggleTrialMediaCapture = () => {
        setConfig((prev) => toggleTrialMediaCaptureEnabled(prev));
    };

    const patchTrialMediaCapture = (patch: Partial<typeof trialMedia>) => {
        setConfig((prev) => patchTrialMediaCaptureConfig(prev, patch));
    };

    const buildFinalConfig = (): ProductTestConfig => {
        const fixedIds = ptBank
            .filter(q => q.question_status === 'fixed')
            .map(q => q.question_id);
        return buildFinalProductTestConfigWithTrialMedia(config, fixedIds);
    };

    const handleSave = () => {
        const finalConfig = buildFinalConfig();
        onConfirm(finalConfig, { productBank: ptBank, packageBank: pkgBank });
    };

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl bg-white dark:bg-slate-950 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-colors"
            >
                {/* Header */}
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue flex items-center justify-center shadow-inner">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">
                                Product Test <span className="text-brand-blue">Architect</span>
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Configure taste test / performance attributes and package attachment.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Language Selection */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => setConfig(prev => ({ ...prev, language: 'en' }))}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${config.language === 'en' ? 'bg-white dark:bg-slate-950 text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                English
                            </button>
                            <button
                                onClick={() => setConfig(prev => ({ ...prev, language: 'ar' }))}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${config.language === 'ar' ? 'bg-white dark:bg-slate-950 text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                العربية
                            </button>
                        </div>

                        <button onClick={onClose} className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all shadow-sm">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar transition-colors">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4">
                            <div className="w-8 h-8 rounded-full border-4 border-brand-blue border-r-transparent animate-spin" />
                            <p className="text-sm font-semibold text-slate-500">Loading Question Banks...</p>
                        </div>
                    ) : (
                        <>
                            {/* Intro info alert */}
                            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl flex gap-3 text-xs text-slate-500 dark:text-slate-400 shadow-sm leading-relaxed">
                                <Info className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">Instruction:</span> Select optional attributes to customize the product feedback loops. Fixed attributes are always included. Badges point out evaluated dimensions: <span className="font-black text-sky-500 dark:text-sky-400">PF</span> for product performance capabilities and <span className="font-black text-rose-500 dark:text-rose-400">EM</span> for deeper emotional feedback.
                                </div>
                            </div>

                            {/* Main attribute groups */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Evaluation Modules</h3>

                                {Object.entries(groupedAttributes).map(([groupName, questions]) => {
                                    const isExpanded = !!expandedGroups[groupName];
                                    return (
                                        <div
                                            key={groupName}
                                            className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm overflow-hidden"
                                        >
                                            <button
                                                onClick={() => toggleGroup(groupName)}
                                                className="w-full flex items-center justify-between p-5 text-left border-b border-transparent dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-900/80 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Layers className="w-5 h-5 text-slate-400" />
                                                    <span className="font-bold tracking-tight text-slate-800 dark:text-slate-200">{groupName}</span>
                                                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">
                                                        {questions.length} question{questions.length !== 1 && 's'}
                                                    </span>
                                                </div>
                                                {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                                            </button>

                                            <AnimatePresence initial={false}>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0 }}
                                                        animate={{ height: 'auto' }}
                                                        exit={{ height: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="p-5 bg-slate-50/30 dark:bg-slate-950/20 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {questions.map(q => {
                                                                const isFixed = q.question_status === 'fixed';
                                                                const isSelected = isFixed || config.selected_attributes.includes(q.attribute);
                                                                const tag = q.diagnostic_tag;

                                                                return (
                                                                    <div
                                                                        key={q.question_id}
                                                                        onClick={() => handleSelectAttribute(q.attribute, isFixed)}
                                                                        className={`relative p-4 rounded-xl border flex items-start gap-4 transition-all select-none ${isFixed
                                                                            ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-850 opacity-80 cursor-default'
                                                                            : isSelected
                                                                                ? 'bg-white dark:bg-slate-900 border-brand-blue/30 shadow-md shadow-brand-blue/5 dark:shadow-none cursor-pointer'
                                                                                : 'bg-white dark:bg-slate-900/20 border-slate-150 dark:border-slate-800 opacity-60 hover:opacity-100 cursor-pointer'
                                                                            }`}
                                                                    >
                                                                        <div className="mt-1 shadow-sm shrink-0">
                                                                            {isFixed ? (
                                                                                <CheckSquare className="w-4 h-4 text-slate-400 dark:text-slate-500 fill-slate-100 dark:fill-slate-800" />
                                                                            ) : isSelected ? (
                                                                                <CheckSquare className="w-4 h-4 text-brand-blue fill-brand-blue/10" />
                                                                            ) : (
                                                                                <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                                                                            )}
                                                                        </div>

                                                                        <div className="space-y-1 pr-6 flex-1">
                                                                            <h4 className="text-xs font-black text-slate-850 dark:text-slate-100 tracking-tight">
                                                                                {q.attribute}
                                                                            </h4>
                                                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-normal line-clamp-2">
                                                                                {config.language === 'ar' ? q.ar_text : q.en_text}
                                                                            </p>
                                                                        </div>

                                                                        {/* Diagnostic Tag Badges */}
                                                                        {tag && (
                                                                            <span className={`absolute top-3 right-3 text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full select-none ${tag === 'PF'
                                                                                ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-900/50'
                                                                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50'
                                                                                }`}>
                                                                                {tag}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Attachable Package Test Module Option */}
                            <div className="bg-slate-50/50 dark:bg-slate-900/30 rounded-3xl p-6 border border-slate-150 dark:border-slate-800 shadow-inner">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-white dark:bg-slate-850 border border-slate-150 dark:border-slate-800 rounded-xl text-slate-500">
                                            <Box className="w-5 h-5 text-brand-blue" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 dark:text-white tracking-tight">Attach Package Test Module</h4>
                                            <p className="text-[11px] text-slate-450 dark:text-slate-400 font-medium">Include detailed ergonomics and visual box/container feedback.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={togglePackageTest}
                                        className={`w-12 h-6 rounded-full relative transition-all ${config.package_test_enabled ? 'bg-brand-blue' : 'bg-slate-200 dark:bg-slate-800'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${config.package_test_enabled ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>

                                <AnimatePresence initial={false}>
                                    {config.package_test_enabled && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                            animate={{ height: 'auto', opacity: 1, marginTop: 20 }}
                                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                                                <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-450">Package Attributes Selection</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {pkgBank.map(q => {
                                                        const isFixed = q.question_status === 'fixed';
                                                        const isSelected = isFixed || config.package_test_attributes.includes(q.attribute);

                                                        return (
                                                            <div
                                                                key={q.question_id}
                                                                onClick={() => handleSelectPkgAttribute(q.attribute, isFixed)}
                                                                className={`relative p-4 rounded-xl border flex items-start gap-4 transition-all select-none ${isFixed
                                                                    ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-850 opacity-80 cursor-default'
                                                                    : isSelected
                                                                        ? 'bg-white dark:bg-slate-900 border-brand-blue/30 shadow-md shadow-brand-blue/5 dark:shadow-none cursor-pointer'
                                                                        : 'bg-white dark:bg-slate-900/20 border-slate-150 dark:border-slate-800 opacity-60 hover:opacity-100 cursor-pointer'
                                                                    }`}
                                                            >
                                                                <div className="mt-1 shadow-sm shrink-0">
                                                                    {isFixed ? (
                                                                        <CheckSquare className="w-4 h-4 text-slate-400 dark:text-slate-500 fill-slate-100 dark:fill-slate-800" />
                                                                    ) : isSelected ? (
                                                                        <CheckSquare className="w-4 h-4 text-brand-blue fill-brand-blue/10" />
                                                                    ) : (
                                                                        <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                                                                    )}
                                                                </div>

                                                                <div className="space-y-1 flex-1">
                                                                    <h4 className="text-xs font-black text-slate-850 dark:text-slate-100 tracking-tight">
                                                                        {q.attribute}
                                                                    </h4>
                                                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-normal line-clamp-2">
                                                                        {config.language === 'ar' ? q.ar_text : q.en_text}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Trial media upload (photo / video evidence) */}
                            <div className="bg-slate-50/50 dark:bg-slate-900/30 rounded-3xl p-6 border border-slate-150 dark:border-slate-800 shadow-inner">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-white dark:bg-slate-850 border border-slate-150 dark:border-slate-800 rounded-xl text-slate-500">
                                            <Camera className="w-5 h-5 text-brand-blue" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 dark:text-white tracking-tight">
                                                Trial Media Upload
                                            </h4>
                                            <p className="text-[11px] text-slate-450 dark:text-slate-400 font-medium">
                                                Ask respondents to upload a product trial photo or short video.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={toggleTrialMediaCapture}
                                        className={`w-12 h-6 rounded-full relative transition-all shrink-0 ${trialMedia.enabled ? 'bg-brand-blue' : 'bg-slate-200 dark:bg-slate-800'}`}
                                        aria-pressed={trialMedia.enabled}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${trialMedia.enabled ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>

                                <AnimatePresence initial={false}>
                                    {trialMedia.enabled && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                            animate={{ height: 'auto', opacity: 1, marginTop: 20 }}
                                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-450">
                                                            Accepted media
                                                        </label>
                                                        <select
                                                            value={trialMedia.accepted_media}
                                                            onChange={(e) => patchTrialMediaCapture({
                                                                accepted_media: e.target.value as typeof trialMedia.accepted_media,
                                                            })}
                                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200"
                                                        >
                                                            {TRIAL_MEDIA_ACCEPTED_OPTIONS.map((opt) => (
                                                                <option key={opt.value} value={opt.value}>
                                                                    {isArabic ? opt.labelAr : opt.labelEn}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-450">
                                                            Timing phase
                                                        </label>
                                                        <select
                                                            value={trialMedia.timing}
                                                            onChange={(e) => patchTrialMediaCapture({
                                                                timing: e.target.value as typeof trialMedia.timing,
                                                            })}
                                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200"
                                                        >
                                                            {TRIAL_MEDIA_CAPTURE_TIMING_OPTIONS.map((opt) => (
                                                                <option key={opt.value} value={opt.value}>
                                                                    {isArabic ? opt.labelAr : opt.labelEn}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-4">
                                                    <label className="flex items-center gap-3 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={trialMedia.required}
                                                            onChange={(e) => patchTrialMediaCapture({ required: e.target.checked })}
                                                            className="w-4 h-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                                                        />
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                                            Required question
                                                        </span>
                                                    </label>
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                                        <span>Max video length</span>
                                                        <input
                                                            type="number"
                                                            min={5}
                                                            max={120}
                                                            value={trialMedia.max_video_duration_seconds}
                                                            onChange={(e) => patchTrialMediaCapture({
                                                                max_video_duration_seconds: Number(e.target.value) || 60,
                                                            })}
                                                            className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-center font-black text-slate-800 dark:text-white"
                                                        />
                                                        <span>seconds</span>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-450">
                                                        Respondent prompt ({isArabic ? 'Arabic' : 'English'})
                                                    </label>
                                                    <textarea
                                                        value={isArabic ? trialMedia.prompt_ar : trialMedia.prompt_en}
                                                        onChange={(e) => patchTrialMediaCapture(
                                                            isArabic
                                                                ? { prompt_ar: e.target.value }
                                                                : { prompt_en: e.target.value },
                                                        )}
                                                        rows={3}
                                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 resize-none"
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 flex justify-end gap-4 transition-colors">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 text-xs font-bold text-slate-450 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex items-center gap-2 bg-slate-900 dark:bg-brand-blue hover:bg-black dark:hover:bg-brand-blue/80 text-white px-8 py-4 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-brand-blue/20 transition-all font-black text-xs border-none disabled:opacity-50"
                    >
                        <Check className="w-4 h-4" />
                        Apply Configurations
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
}
