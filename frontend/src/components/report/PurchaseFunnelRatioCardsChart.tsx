import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

type BrandCard = {
    brand: string;
    stage_bars?: Array<{ stage_key: string; label: string; value: number }>;
    ratio_labels?: Array<{ ratio_key: string; label: string; value: number; text?: string }>;
    display_sequence?: Array<{ type: 'stage' | 'ratio'; key: string }>;
};

type Props = {
    data: { brand_cards?: BrandCard[] };
    metadata?: {
        visible_brand_options?: Array<number | 'all'>;
        default_visible_brands?: number | 'all';
    };
    isFocusMode?: boolean;
    presentationHeight?: number;
};

const DEFAULT_DISPLAY_SEQUENCE: Array<{ type: 'stage' | 'ratio'; key: string }> = [
    { type: 'stage', key: 'mou' },
    { type: 'ratio', key: 'commitment' },
    { type: 'stage', key: 'bought_3m' },
    { type: 'ratio', key: 'loyalty' },
    { type: 'stage', key: 'bought_12m' },
    { type: 'ratio', key: 'conversion' },
    { type: 'stage', key: 'consideration' },
    { type: 'ratio', key: 'attractive' },
    { type: 'stage', key: 'total_awareness' },
];

const toPercent = (v: number) => {
    if (!Number.isFinite(v)) return 0;
    if (v >= 0 && v <= 1) return v * 100;
    return v;
};

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

export function PurchaseFunnelRatioCardsChart({ data, metadata, isFocusMode, presentationHeight }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const cards = React.useMemo(() => data?.brand_cards || [], [data]);

    const initialVisible = React.useMemo(() => {
        const def = metadata?.default_visible_brands;
        if (def === 'all') return 'all' as const;
        if (typeof def === 'number' && def > 0) return def;
        return 1;
    }, [metadata]);

    const [selectedBrands, setSelectedBrands] = React.useState<string[]>([]);
    const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);
    const [baselineBrand, setBaselineBrand] = React.useState<string | null>(null);
    const [showMarketAverage, setShowMarketAverage] = React.useState<boolean>(true);

    const baselineData = React.useMemo(() => {
        if (!baselineBrand) return null;
        return cards.find((c) => c.brand === baselineBrand) || null;
    }, [cards, baselineBrand]);

    const averageRatios = React.useMemo(() => {
        const sums: Record<string, number> = {};
        const counts: Record<string, number> = {};
        const targetKeys = ['attractive', 'conversion', 'loyalty', 'commitment'];

        cards.forEach((card) => {
            card.ratio_labels?.forEach((r) => {
                const val = toPercent(r.value);
                if (targetKeys.includes(r.ratio_key) && Number.isFinite(val)) {
                    sums[r.ratio_key] = (sums[r.ratio_key] || 0) + val;
                    counts[r.ratio_key] = (counts[r.ratio_key] || 0) + 1;
                }
            });
        });

        const avgs: Record<string, number> = {};
        targetKeys.forEach((k) => {
            avgs[k] = counts[k] > 0 ? sums[k] / counts[k] : 0;
        });
        return avgs;
    }, [cards]);

    React.useEffect(() => {
        if (cards.length > 0 && selectedBrands.length === 0) {
            if (initialVisible === 'all') {
                setSelectedBrands(cards.map((c) => c.brand));
            } else {
                const count = typeof initialVisible === 'number' ? initialVisible : 1;
                setSelectedBrands(cards.slice(0, count).map((c) => c.brand));
            }
        }
    }, [cards, initialVisible]);

    const visibleCards = React.useMemo(() => {
        return cards.filter((c) => selectedBrands.includes(c.brand));
    }, [cards, selectedBrands]);

    const toggleBrand = (brand: string) => {
        setSelectedBrands((prev) => (prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]));
    };

    if (!cards.length) {
        return <div className={`text-center py-20 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No semantic data available</div>;
    }

    const containerStyle = isFocusMode ? { maxHeight: presentationHeight || 650 } : undefined;

    return (
        <div className="w-full flex flex-col gap-6" style={containerStyle}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        Brand Selection
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowMarketAverage(!showMarketAverage)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${showMarketAverage
                                ? 'bg-primary/10 border-primary text-primary-soft shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                                : isDark
                                    ? 'bg-slate-800/50 border-white/5 text-slate-500 hover:text-slate-300'
                                    : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <div className={`w-1.5 h-1.5 rounded-full ${showMarketAverage ? 'bg-primary shadow-[0_0_8px_rgba(56,189,248,0.6)] animate-pulse' : 'bg-slate-500'}`} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Market Avg</span>
                        </button>
                        <div className={`w-[1px] h-3 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                        <button
                            onClick={() => setSelectedBrands(cards.map((c) => c.brand))}
                            className={`text-[9px] font-black uppercase tracking-widest transition-colors ${isDark ? 'text-slate-400 hover:text-primary-soft' : 'text-slate-500 hover:text-primary-soft'
                                }`}
                        >
                            Select All
                        </button>
                        <div className={`w-[1px] h-3 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                        <button
                            onClick={() => setSelectedBrands([])}
                            className={`text-[9px] font-black uppercase tracking-widest transition-colors ${isDark ? 'text-slate-400 hover:text-rose-400' : 'text-slate-500 hover:text-rose-500'
                                }`}
                        >
                            Clear
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
                    {cards.map((card) => {
                        const active = selectedBrands.includes(card.brand);
                        return (
                            <button
                                key={`pf-brand-toggle-${card.brand}`}
                                onClick={() => toggleBrand(card.brand)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap flex-shrink-0 ${active
                                    ? 'bg-primary/10 text-primary-soft border-primary'
                                    : isDark
                                        ? 'bg-slate-900/40 text-slate-500 border-white/5 hover:border-white/20'
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                    }`}
                            >
                                <span className={`mr-2 inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-primary animate-pulse' : 'bg-slate-600'}`} />
                                {card.brand}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 overflow-auto pr-1">
                <AnimatePresence mode="popLayout">
                    {visibleCards.map((card, cardIdx) => {
                        const stageMap = new Map((card.stage_bars || []).map((s) => [s.stage_key, s]));
                        const ratioMap = new Map((card.ratio_labels || []).map((r) => [r.ratio_key, r]));
                        const displaySequence = (card.display_sequence && card.display_sequence.length)
                            ? card.display_sequence
                            : DEFAULT_DISPLAY_SEQUENCE;

                        return (
                            <motion.div
                                key={`pf-card-${card.brand}`}
                                layout
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                transition={{ duration: 0.4, delay: cardIdx * 0.05, ease: [0.23, 1, 0.32, 1] }}
                                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                                className={`rounded-[2.5rem] border p-8 backdrop-blur-xl transition-shadow hover:shadow-2xl ${isDark
                                    ? 'border-white/10 bg-slate-900/40 shadow-slate-950/20'
                                    : 'border-slate-200/60 bg-white/70 shadow-slate-200/40'
                                    }`}
                            >
                                <div className="mb-10 flex items-center justify-between flex-wrap gap-4">
                                    <div className="flex items-center gap-3">
                                        <h4 className={`text-base font-black uppercase tracking-[0.2em] ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {card.brand}
                                        </h4>
                                        {baselineBrand === card.brand && (
                                            <span className="px-2 py-0.5 rounded-full bg-primary text-[8px] font-black text-white uppercase tracking-widest animate-pulse">
                                                Baseline
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setBaselineBrand(baselineBrand === card.brand ? null : card.brand)}
                                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${baselineBrand === card.brand
                                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/50 hover:bg-rose-500 hover:text-white'
                                            : isDark
                                                ? 'bg-slate-800/50 text-slate-500 border-white/5 hover:border-primary/50 hover:text-primary-soft'
                                                : 'bg-white text-slate-400 border-slate-200 hover:border-primary/50 hover:text-primary-soft'
                                            }`}
                                    >
                                        {baselineBrand === card.brand ? 'Clear Baseline' : 'Set as Baseline'}
                                    </button>
                                </div>

                                <div className="space-y-0 flex flex-col items-center">
                                    {displaySequence.map((row, idx) => {
                                        if (row.type === 'stage') {
                                            const stage = stageMap.get(row.key);
                                            if (!stage) return null;
                                            const pct = clampPct(toPercent(stage.value));

                                            const isHighlighted =
                                                hoveredKey === row.key ||
                                                (idx > 0 && displaySequence[idx - 1].key === hoveredKey) ||
                                                (idx < displaySequence.length - 1 && displaySequence[idx + 1].key === hoveredKey);

                                            // Calculate Delta
                                            const baselineStage = baselineData?.stage_bars?.find(s => s.stage_key === row.key);
                                            const delta = (baselineData && baselineBrand !== card.brand && baselineStage)
                                                ? toPercent(stage.value) - toPercent(baselineStage.value)
                                                : null;

                                            return (
                                                <div
                                                    key={`stage-${card.brand}-${row.key}-${idx}`}
                                                    className={`w-full max-w-[280px] space-y-2 py-3 transition-all duration-300 ${hoveredKey && !isHighlighted ? 'opacity-30 scale-[0.98]' : 'opacity-100 scale-100'
                                                        }`}
                                                    onMouseEnter={() => setHoveredKey(row.key)}
                                                    onMouseLeave={() => setHoveredKey(null)}
                                                >
                                                    <div className="flex flex-col items-center text-center gap-0.5">
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                            {stage.label}
                                                        </span>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`text-xs font-black ${isDark ? 'text-primary-soft' : 'text-primary-soft'}`}>
                                                                {Math.round(pct)}%
                                                            </span>
                                                            {delta !== null && (
                                                                <span className={`text-[10px] font-black ${delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                    {delta >= 0 ? '+' : ''}{Math.round(delta)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className={`h-2.5 rounded-full overflow-hidden flex justify-center ${isDark ? 'bg-slate-800/30' : 'bg-slate-200/40'}`}>
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-brand-blue to-cyan-400 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const ratio = ratioMap.get(row.key);
                                        if (!ratio) return null;
                                        const ratioPct = clampPct(toPercent(ratio.value));

                                        const isHighlighted =
                                            hoveredKey === row.key ||
                                            (idx > 0 && displaySequence[idx - 1].key === hoveredKey) ||
                                            (idx < displaySequence.length - 1 && displaySequence[idx + 1].key === hoveredKey);

                                        // Calculate Ratio Delta
                                        const baselineRatio = baselineData?.ratio_labels?.find(r => r.ratio_key === row.key);
                                        const rDelta = (baselineData && baselineBrand !== card.brand && baselineRatio)
                                            ? toPercent(ratio.value) - toPercent(baselineRatio.value)
                                            : null;

                                        // Calculate Performance Chroma
                                        const avgVal = averageRatios[row.key];
                                        const brandVal = toPercent(ratio.value);
                                        const isBetter = brandVal > avgVal + 2;
                                        const isWorse = brandVal < avgVal - 2;

                                        return (
                                            <div key={`ratio-group-${card.brand}-${row.key}-${idx}`} className="flex flex-col items-center w-full">
                                                {/* Connector Top */}
                                                <div
                                                    className={`w-[1px] h-3 border-l border-dashed transition-colors duration-300 ${isHighlighted ? 'border-primary scale-y-110' : isDark ? 'border-white/10' : 'border-slate-300'}`}
                                                />

                                                <div
                                                    onMouseEnter={() => setHoveredKey(row.key)}
                                                    onMouseLeave={() => setHoveredKey(null)}
                                                    className={`py-1.5 px-3 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all duration-300 ${isHighlighted
                                                        ? 'scale-105 shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                                                        : 'opacity-40'
                                                        } ${!hoveredKey ? 'opacity-100' : ''} ${showMarketAverage && averageRatios[row.key] > 0
                                                            ? isBetter
                                                                ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_10px_rgba(16,185,129,0.05)]'
                                                                : isWorse
                                                                    ? 'border-rose-500/50 bg-rose-500/5 shadow-[0_0_10px_rgba(244,63,94,0.05)]'
                                                                    : 'border-amber-400/50 bg-amber-400/5 shadow-[0_0_10px_rgba(251,191,36,0.05)]'
                                                            : isDark
                                                                ? 'border-white/5 bg-white/[0.02]'
                                                                : 'border-slate-100 bg-white/50'
                                                        }`}
                                                >
                                                    <span className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                                        {ratio.label}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[11px] font-black ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                                                            {Math.round(ratioPct)}%
                                                        </span>

                                                        <AnimatePresence>
                                                            {showMarketAverage && averageRatios[row.key] > 0 && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, x: -5 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    exit={{ opacity: 0, x: 5 }}
                                                                    className="flex items-center gap-1.5 opacity-80"
                                                                >
                                                                    <span className={`text-[10px] font-medium ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>→</span>
                                                                    <div className="flex flex-col items-start leading-none">
                                                                        <span className={`text-[10px] font-black tracking-tighter ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                            {Math.round(averageRatios[row.key])}%
                                                                        </span>
                                                                        <span className="text-[7px] font-black uppercase tracking-tighter text-slate-500">avg</span>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        <AnimatePresence>
                                                            {rDelta !== null && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.8 }}
                                                                    className={`flex flex-col items-center leading-none ml-1 border-l pl-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}
                                                                >
                                                                    <span className={`text-[10px] font-black ${rDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                        {rDelta >= 0 ? '+' : ''}{Math.round(rDelta)}%
                                                                    </span>
                                                                    <span className="text-[7px] font-black uppercase tracking-tighter text-slate-500">base line</span>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </div>

                                                {/* Connector Bottom */}
                                                <div
                                                    className={`w-[1px] h-3 border-l border-dashed transition-colors duration-300 ${isHighlighted ? 'border-primary scale-y-110' : isDark ? 'border-white/10' : 'border-slate-300'}`}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}
