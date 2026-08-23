import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import type { ModuleQuestionRendererProps } from '../../types/moduleQuestions';
import { resolvePurchaseFunnelBrands } from '../../utils/purchaseFunnelBrandLogic';
import { asBrandPipelineCarrier } from '../../utils/moduleQuestionUtils';

/**
 * Premium Perception Grid for Brand Analyzer.
 * Maps attributes (rows) to brands (columns).
 */
export default function BrandAnalyzerGrid({
    question,
    answer,
    onChange,
    language,
    brandContext,
    allAnswers = {},
}: ModuleQuestionRendererProps) {
    const isAr = language === 'ar';
    const rows = question.questionMeta?.rows || [];

    const masterBrands = useMemo(() => {
        const base = brandContext?.masterBrands || [];
        const custom = brandContext?.customBrands || [];
        return Array.from(new Set([...base, ...custom]));
    }, [brandContext]);

    const carrier = asBrandPipelineCarrier(question);
    const applicableBrands = resolvePurchaseFunnelBrands(
        carrier,
        masterBrands,
        allAnswers as Record<string, unknown>
    );

    const currentAnswers = (answer as Record<string, string[]>) || {};

    const toggleBrand = (attrId: string, brand: string) => {
        const attrAnswers = currentAnswers[attrId] || [];
        const newAttrs = attrAnswers.includes(brand)
            ? attrAnswers.filter(b => b !== brand)
            : [...attrAnswers, brand];

        onChange({
            ...currentAnswers,
            [attrId]: newAttrs
        });
    };

    if (applicableBrands.length === 0) {
        return (
            <div className="p-8 text-center glass-panel rounded-3xl border border-line/80 dark:border-line/10 italic text-slate-400">
                {isAr ? 'لا توجد علامات تجارية متاحة للتقييم' : 'No brands available for evaluation'}
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col gap-4">
            {/* The Perception Grid - Advanced Layout */}
            <div className="relative glass-panel rounded-[2.5rem] border border-line/80 dark:border-line/10 shadow-2xl overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl">

                {/* 1. Header Section - Locked to top */}
                <div
                    className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-line/80 dark:border-line/10 grid"
                    style={{ gridTemplateColumns: `minmax(120px, 200px) repeat(${applicableBrands.length}, minmax(0, 1fr))` }}
                >
                    <div className="p-5 text-start font-black uppercase tracking-[0.2em] text-[10px] text-primary-soft border-r border-slate-50 dark:border-slate-800/50 sticky left-0 z-50 bg-inherit">
                        {isAr ? 'الصفات' : 'Attributes'}
                    </div>
                    {applicableBrands.map(brand => (
                        <div key={brand} className="p-3 flex items-center justify-center text-center font-black uppercase tracking-tight text-[10px] md:text-[11px] text-ink-muted border-r border-slate-50 dark:border-slate-800/50 last:border-r-0">
                            {brand}
                        </div>
                    ))}
                </div>

                {/* 2. Scrollable Body Section */}
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                    {rows.map((row: any, rIdx: number) => {
                        const attrId = typeof row === 'string' ? row : row.id;
                        const attrLabel = typeof row === 'string' ? row : row.label;
                        const isLastRow = rIdx === rows.length - 1;

                        return (
                            <div
                                key={attrId}
                                className={`grid group hover:bg-primary/[0.02] transition-colors border-b border-slate-50 dark:border-slate-800/40 ${isLastRow ? 'border-b-0' : ''}`}
                                style={{ gridTemplateColumns: `minmax(120px, 200px) repeat(${applicableBrands.length}, minmax(0, 1fr))` }}
                            >
                                {/* Metric Label (Sticky Left) */}
                                <div className="p-4 md:p-6 font-bold text-xs md:text-sm text-slate-700 dark:text-slate-200 border-r border-slate-50 dark:border-slate-800/50 sticky left-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm group-hover:bg-white dark:group-hover:bg-slate-900">
                                    {attrLabel}
                                </div>

                                {/* Brand Selection Cells */}
                                {applicableBrands.map((brand) => {
                                    const isSelected = (currentAnswers[attrId] || []).includes(brand);

                                    return (
                                        <div
                                            key={brand}
                                            className={`p-1 flex items-center justify-center cursor-pointer transition-all border-r border-slate-50 dark:border-slate-800/50 last:border-r-0 ${isSelected ? 'bg-primary/[0.03]' : ''}`}
                                            onClick={() => toggleBrand(attrId, brand)}
                                        >
                                            <motion.div
                                                initial={false}
                                                animate={{
                                                    scale: isSelected ? 1 : 0.85,
                                                    boxShadow: isSelected ? '0 4px 12px rgba(var(--brand-blue-rgb), 0.3)' : 'none'
                                                }}
                                                className={`w-5 h-5 md:w-6 md:h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected
                                                    ? 'bg-primary border-primary text-white'
                                                    : 'bg-transparent border-slate-200 dark:border-slate-700/50 group-hover:border-primary/30'
                                                    }`}
                                            >
                                                {isSelected && <Check className="w-3 h-3 md:w-4 md:h-4 stroke-[3px]" />}
                                            </motion.div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend / Helper */}
            <p className="px-6 text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-primary-soft" />
                {isAr ? 'اضغط على المربعات لتقييم الماركات' : 'Click the boxes to evaluate the brands'}
            </p>
        </div>
    );
}
