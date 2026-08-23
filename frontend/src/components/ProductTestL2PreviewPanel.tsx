import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import type { ProductTestConfig, ProductTestQuestion, PackageTestQuestion } from '../types/productTest';
import type { ProductTestBrandContextInput } from '../types/productTestRespondent';
import { buildProductTestL2Preview, type L2PreviewSection } from '../utils/productTestPreview';

interface ProductTestPhasePreviewPanelProps {
    config: ProductTestConfig | null | undefined;
    productBank: ProductTestQuestion[];
    packageBank: PackageTestQuestion[];
    brandContextInput?: ProductTestBrandContextInput | null;
    defaultExpanded?: boolean;
}

/** @deprecated Use ProductTestPhasePreviewPanel — alias kept for existing imports */
export const ProductTestL2PreviewPanel = ProductTestPhasePreviewPanel;

export function ProductTestPhasePreviewPanel({
    config,
    productBank,
    packageBank,
    brandContextInput,
    defaultExpanded = false,
}: ProductTestPhasePreviewPanelProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    const preview = useMemo(() => {
        if (!config || productBank.length === 0) return null;
        return buildProductTestL2Preview(config, productBank, packageBank, brandContextInput);
    }, [config, productBank, packageBank, brandContextInput]);

    const sectionsByTiming = useMemo(() => {
        if (!preview) return new Map<string, L2PreviewSection[]>();
        const grouped = new Map<string, L2PreviewSection[]>();
        preview.sections.forEach((section) => {
            const key = section.timing || 'unknown';
            const list = grouped.get(key) || [];
            list.push(section);
            grouped.set(key, list);
        });
        return grouped;
    }, [preview]);

    if (!config || !preview) return null;

    return (
        <div className="rounded-3xl border-2 border-primary/15 bg-primary/[0.03] dark:bg-primary/[0.06] overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-primary/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Layers className="w-4 h-4 text-primary-soft" />
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary-soft">
                            Expected Timing-Phase Preview
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                            {preview.brandCount > 0 && `${preview.brandCount} brand${preview.brandCount === 1 ? '' : 's'} · `}
                            {preview.phaseCount} phase{preview.phaseCount === 1 ? '' : 's'} · {preview.sectionCount} sections · {preview.totalQuestions} question{preview.totalQuestions === 1 ? '' : 's'}
                        </p>
                    </div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 pb-5 space-y-4 border-t border-primary/10">
                            {preview.sections.length === 0 ? (
                                <p className="text-xs text-slate-500 font-medium py-3">
                                    No sections would be generated with the current selection.
                                </p>
                            ) : (
                                Array.from(sectionsByTiming.entries()).map(([timing, sections]) => (
                                    <div key={timing} className="space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary-soft/80 pt-2">
                                            {timing.replace(/_/g, ' ')}
                                        </p>
                                        {sections.map(section => (
                                            <div
                                                key={`${timing}-${section.brand || ''}-${section.title}`}
                                                className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-white/80 dark:bg-slate-950/50 border border-line/80 dark:border-line/10"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">{section.title}</p>
                                                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                                                        {section.brand && (
                                                            <span className="text-[8px] font-black uppercase tracking-wider text-indigo-500">
                                                                {section.displayBrand || section.brand}
                                                            </span>
                                                        )}
                                                        {section.module && section.module !== 'product_test' && (
                                                            <span className={`text-[8px] font-bold uppercase tracking-wider ${section.module === 'trial_media_capture'
                                                                ? 'text-violet-500'
                                                                : 'text-slate-400'
                                                                }`}>
                                                                {section.module === 'trial_media_capture' ? 'Media Upload' : section.module}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 ml-3">
                                                    {section.module === 'trial_media_capture' && (
                                                        <Camera className="w-3.5 h-3.5 text-violet-500" aria-hidden />
                                                    )}
                                                    <span className="text-[10px] font-black text-slate-400">
                                                        {section.questionCount} Q
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
