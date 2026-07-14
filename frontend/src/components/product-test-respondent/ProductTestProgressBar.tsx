import type { ProductTestTimingPhase } from '../../types/productTestRespondent';

interface ProductTestProgressBarProps {
    phases: Array<{ timing: ProductTestTimingPhase; label: string }>;
    phaseIndex: number;
    sectionIndex: number;
    sectionsInCurrentPhase: number;
    progressPercent: number;
    language: 'en' | 'ar';
}

const TIMING_SHORT: Record<ProductTestTimingPhase, { en: string; ar: string }> = {
    before_use: { en: 'Before', ar: 'قبل' },
    during_use: { en: 'During', ar: 'أثناء' },
    after_use: { en: 'After', ar: 'بعد' },
    packaging: { en: 'Pack', ar: 'تغليف' },
};

export default function ProductTestProgressBar({
    phases,
    phaseIndex,
    sectionIndex,
    sectionsInCurrentPhase,
    progressPercent,
    language,
}: ProductTestProgressBarProps) {
    const isArabic = language === 'ar';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {isArabic ? 'تقدم التقييم' : 'Evaluation Progress'}
                </span>
                <span className="text-[10px] font-black text-brand-blue">{progressPercent}%</span>
            </div>

            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-brand-blue via-brand-accent to-brand-cyan transition-all duration-700 ease-out"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            <div className="flex flex-wrap gap-2">
                {phases.map((phase, index) => {
                    const isActive = index === phaseIndex;
                    const isDone = index < phaseIndex;
                    const short = TIMING_SHORT[phase.timing][language];

                    return (
                        <div
                            key={phase.timing}
                            className={`flex-1 min-w-[4.5rem] px-3 py-2 rounded-xl border text-center transition-all ${
                                isActive
                                    ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue shadow-sm'
                                    : isDone
                                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/60 text-emerald-700 dark:text-emerald-400'
                                      : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 text-slate-400'
                            }`}
                        >
                            <p className="text-[9px] font-black uppercase tracking-wider">{short}</p>
                            {isActive && sectionsInCurrentPhase > 0 && (
                                <p className="text-[8px] font-bold mt-0.5 opacity-70">
                                    {sectionIndex + 1}/{sectionsInCurrentPhase}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
