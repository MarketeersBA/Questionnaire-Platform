import { motion } from 'framer-motion';
import { Clock, Droplets, Package, Sparkles, PlayCircle } from 'lucide-react';
import type { ProductTestTimingPhase } from '../../types/productTestRespondent';
import { getProductTestPhaseIntro } from '../../utils/productTestPhaseIntro';
import ProductTestProgressBar from './ProductTestProgressBar';

interface ProductTestPhaseHeaderProps {
    timing: ProductTestTimingPhase;
    phaseLabel: string;
    phaseIndex: number;
    sectionIndex: number;
    phases: Array<{ timing: ProductTestTimingPhase; label: string }>;
    sectionsPerPhase: number[];
    progressPercent: number;
    language: 'en' | 'ar';
    mode: 'intro' | 'section';
    sectionTitle?: string;
    brandDisplay?: string;
    category?: string;
}

const TIMING_ICONS: Record<ProductTestTimingPhase, typeof Clock> = {
    before_use: Clock,
    during_use: PlayCircle,
    after_use: Droplets,
    packaging: Package,
};

export default function ProductTestPhaseHeader({
    timing,
    phaseLabel,
    phaseIndex,
    sectionIndex,
    phases,
    sectionsPerPhase,
    progressPercent,
    language,
    mode,
    sectionTitle,
    brandDisplay,
    category,
}: ProductTestPhaseHeaderProps) {
    const isArabic = language === 'ar';
    const Icon = TIMING_ICONS[timing];
    const intro = getProductTestPhaseIntro(timing, language, { brandDisplay, category });
    const sectionsInCurrentPhase = sectionsPerPhase[phaseIndex] ?? 0;

    return (
        <div className="space-y-6">
            <ProductTestProgressBar
                phases={phases}
                phaseIndex={phaseIndex}
                sectionIndex={sectionIndex}
                sectionsInCurrentPhase={sectionsInCurrentPhase}
                progressPercent={progressPercent}
                language={language}
            />

            {mode === 'intro' ? (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden p-8 md:p-10 rounded-[2.5rem] bg-gradient-to-br from-brand-blue/8 via-brand-blue/4 to-transparent border-2 border-brand-blue/15"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-blue/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10 space-y-5">
                        <div className="w-14 h-14 rounded-2xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center">
                            <Icon className="w-7 h-7 text-brand-blue" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-blue/70 mb-2">
                                {isArabic ? 'مرحلة التقييم' : 'Evaluation Phase'}
                            </p>
                            <h2 className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white">
                                {intro.title}
                            </h2>
                        </div>
                        <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                            {intro.body}
                        </p>
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-brand-blue/10">
                            <Sparkles className="w-4 h-4 text-brand-cyan shrink-0 mt-0.5" />
                            <p className="text-sm text-slate-500 dark:text-slate-400 italic">{intro.hint}</p>
                        </div>
                    </div>
                </motion.div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-brand-blue" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {phaseLabel}
                            </p>
                            <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                                {sectionTitle}
                            </h2>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
