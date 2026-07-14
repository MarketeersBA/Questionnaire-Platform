import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import type { ModuleQuestionRendererProps } from '../../types/moduleQuestions';
import { resolvePurchaseFunnelBrands } from '../../utils/purchaseFunnelBrandLogic';
import { asBrandPipelineCarrier, getQuestionDisplayText } from '../../utils/moduleQuestionUtils';

/**
 * Premium Satisfaction Loop for Brand Analyzer.
 * Iterates through each known brand with a 1-5 scalar rating.
 */
export default function BrandSatisfactionLoop({
    question,
    answer,
    onChange,
    language,
    brandContext,
    allAnswers = {},
    placeholders
}: ModuleQuestionRendererProps) {
    const isAr = language === 'ar';

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

    const [currentIndex, setCurrentIndex] = useState(0);
    const currentBrand = applicableBrands[currentIndex];

    const currentAnswers = (answer as Record<string, number>) || {};

    const setRating = (rating: number) => {
        onChange({
            ...currentAnswers,
            [currentBrand]: rating
        });

        // Auto-advance if not last
        if (currentIndex < applicableBrands.length - 1) {
            setTimeout(() => setCurrentIndex(prev => prev + 1), 500);
        }
    };

    if (applicableBrands.length === 0) {
        return (
            <div className="p-8 text-center glass-panel rounded-3xl border border-slate-100 dark:border-slate-800 italic text-slate-400">
                {isAr ? 'لا توجد علامات تجارية متاحة للتقييم' : 'No brands available for evaluation'}
            </div>
        );
    }

    const labels = [
        isAr ? 'غير راضٍ تمامًا' : 'Very Dissatisfied',
        isAr ? 'غير راضٍ' : 'Dissatisfied',
        isAr ? 'محايد' : 'Neutral',
        isAr ? 'راضٍ' : 'Satisfied',
        isAr ? 'راضٍ تمامًا' : 'Very Satisfied'
    ];

    const progressPercent = ((currentIndex + 1) / applicableBrands.length) * 100;
    const brandSpecificText = getQuestionDisplayText(question, language, { ...placeholders, brand: currentBrand });

    return (
        <div className="space-y-8 max-w-xl mx-auto py-6">
            <div className="space-y-4 text-center">
                <div className="flex items-center justify-center gap-4">
                    <div className="h-0.5 w-8 bg-slate-100 dark:bg-slate-800 rounded-full" />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-blue">
                        {isAr ? 'جاري تقييم البراند' : 'Evaluating Brand'}
                    </span>
                    <div className="h-0.5 w-8 bg-slate-100 dark:bg-slate-800 rounded-full" />
                </div>

                <h3 className="text-4xl font-display font-black text-slate-900 dark:text-white transition-all">
                    {currentBrand}
                </h3>

                <p className="text-slate-500 font-medium max-w-sm mx-auto leading-relaxed">
                    {brandSpecificText}
                </p>
            </div>

            <div className="relative pt-4">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentBrand}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="glass-panel rounded-[2.5rem] p-8 space-y-10 border-slate-200 dark:border-slate-800 shadow-2xl relative z-10"
                    >
                        <div className="flex justify-between items-center gap-1 sm:gap-4 px-2">
                            {[1, 2, 3, 4, 5].map(val => {
                                const isSelected = currentAnswers[currentBrand] === val;
                                return (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setRating(val)}
                                        className="group flex flex-col items-center gap-3 outline-none flex-1"
                                    >
                                        <motion.div
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-xl font-black transition-all ${isSelected
                                                ? 'bg-brand-blue text-white shadow-xl shadow-brand-blue/30 scale-110'
                                                : 'bg-slate-50 dark:bg-slate-800/50 text-slate-300 dark:text-slate-600 group-hover:bg-slate-100 dark:group-hover:bg-white/10'
                                                }`}
                                        >
                                            {val}
                                        </motion.div>
                                        <span className={`text-[8px] font-black uppercase tracking-widest text-center h-8 flex items-center justify-center transition-colors ${isSelected ? 'text-brand-blue' : 'text-slate-300 dark:text-slate-700'}`}>
                                            {labels[val - 1]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="space-y-6 pt-4">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span className="bg-slate-50 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-100 dark:border-slate-700">
                        {isAr ? 'ماركة' : 'Brand'} {currentIndex + 1} of {applicableBrands.length}
                    </span>
                    <span className="text-brand-blue">{Math.round(progressPercent)}%</span>
                </div>

                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden p-0.5 border border-slate-100 dark:border-slate-800">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        className="h-full bg-brand-blue rounded-full shadow-[0_0_15px_rgba(var(--brand-blue-rgb),0.6)]"
                    />
                </div>

                <div className="flex gap-4 pt-4">
                    <button
                        type="button"
                        disabled={currentIndex === 0}
                        onClick={() => setCurrentIndex(prev => prev - 1)}
                        className="flex-1 py-4 rounded-3xl border-2 border-slate-200 dark:border-slate-800 font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {isAr ? 'السابق' : 'Previous'}
                    </button>
                    <button
                        type="button"
                        disabled={currentIndex === applicableBrands.length - 1}
                        onClick={() => setCurrentIndex(prev => prev + 1)}
                        className="flex-1 py-4 rounded-3xl border-2 border-slate-200 dark:border-slate-800 font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                        {isAr ? 'التالي' : 'Next'}
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
