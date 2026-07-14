import { useState, useMemo, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Filter, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateProportionSig } from '../../utils/statUtils';

const COLORS = [
    '#60a5fa', // Blue
    '#34d399', // Emerald
    '#fb7185', // Rose
    '#fbbf24', // Amber
    '#a78bfa', // Violet
    '#22d3ee', // Cyan
];

interface CriteriaTableChartProps {
    data: {
        columns: string[];
        brands?: string[];
        my_brand?: string;
        top_competitor?: string;
        rows: (string | number)[][];
        raw: Array<{
            criteria_name: string;
            significance: number;
            brand_scores: Record<string, number>;
            our_brand_t2b: number;
            competitor_t2b: number;
            diff: number;
        }>;
        brand_ns?: Record<string, number>;
    };
    presentationHeight?: number;
    isFocusMode?: boolean;
    brands?: string[];
}

import { useTheme } from '../../context/ThemeContext';

export function CriteriaTableChart({ data, brands: propBrands, presentationHeight, isFocusMode }: CriteriaTableChartProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const allBrands = useMemo(() => data.brands || propBrands || [], [data, propBrands]);
    const [visibleBrands, setVisibleBrands] = useState<string[]>(allBrands.slice(0, 4));
    const [referenceBrand, setReferenceBrand] = useState<string>(data.my_brand || allBrands[0] || '');
    const [comparisonBrand, setComparisonBrand] = useState<string>(data.top_competitor || allBrands[1] || '');
    const [minConfidence, setMinConfidence] = useState<number>(0.80);

    // Dynamic State Synchronization: Ensure selections are ALWAYS valid when data changes
    useEffect(() => {
        if (allBrands.length > 0) {
            const isRefValid = allBrands.some((b: string) => b.toLowerCase() === referenceBrand.toLowerCase());
            const isCompValid = allBrands.some((b: string) => b.toLowerCase() === comparisonBrand.toLowerCase());

            if (!isRefValid) {
                const fallback = data.my_brand && allBrands.includes(data.my_brand) ? data.my_brand : allBrands[0];
                setReferenceBrand(fallback);
            }
            if (!isCompValid) {
                const fallback = data.top_competitor && allBrands.includes(data.top_competitor) ? data.top_competitor : allBrands[1] || allBrands[0];
                setComparisonBrand(fallback);
            }
            setVisibleBrands((prev: string[]) => prev.filter((b: string) => allBrands.includes(b)));
        }
    }, [allBrands, data.my_brand, data.top_competitor]);

    const findBrandScore = (row: any, brandName: string) => {
        if (!row.brand_scores) return 0;
        if (row.brand_scores[brandName] !== undefined) return row.brand_scores[brandName];
        const key = Object.keys(row.brand_scores).find(k => k.toLowerCase() === brandName.toLowerCase());
        return key ? row.brand_scores[key] : 0;
    };

    const findBrandN = (brandName: string) => {
        if (!data.brand_ns) return 10; // Fallback to 10 if missing
        if (data.brand_ns[brandName] !== undefined) return data.brand_ns[brandName];
        const key = Object.keys(data.brand_ns).find(k => k.toLowerCase() === brandName.toLowerCase());
        return key ? data.brand_ns[key] : 10;
    };

    if (!data?.raw || data.raw.length === 0) {
        return <div className="text-slate-500 text-center py-20 text-lg font-medium italic">No criteria intelligence available for this segment.</div>;
    }

    const rows = data.raw;
    const maxT2B = Math.max(...rows.flatMap(r => Object.values(r.brand_scores || {})), 100);

    const toggleBrand = (brand: string) => {
        setVisibleBrands(prev =>
            prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
        );
    };

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: `repeat(3, minmax(0, 1fr)) 100px ${Array(visibleBrands.length).fill('minmax(0, 1fr)').join(' ')} 110px 110px`,
        gap: '1.5rem'
    };

    return (
        <div className="w-full flex flex-col gap-8">
            <div className={`flex flex-col gap-6 p-8 rounded-[30px] border backdrop-blur-md ${isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex flex-wrap items-center gap-10">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            <Filter className="h-3 w-3" />
                            Active Brands
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {allBrands.map((brand: string) => (
                                <button
                                    key={brand}
                                    onClick={() => toggleBrand(brand)}
                                    className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${visibleBrands.includes(brand) ? (isDark ? 'bg-white/10 border-white/20 text-white' : 'bg-brand-blue text-white active:scale-95') : (isDark ? 'bg-transparent border-white/5 text-slate-500 opacity-40' : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60')}`}
                                >
                                    {brand}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 flex-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                <Target className="h-3 w-3" />
                                Statistics Engine Logic
                            </div>
                            <div className="flex items-center gap-3 px-3 py-1 bg-amber-400/10 border border-amber-400/20 rounded-full animate-pulse">
                                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                                <span className="text-[8px] font-black uppercase text-amber-400 tracking-tighter">Live Calculation Active</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-4 items-center mt-2">
                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-bold text-slate-600 uppercase ml-1">Baseline</span>
                                <select
                                    value={referenceBrand}
                                    onChange={(e) => setReferenceBrand(e.target.value)}
                                    className="bg-slate-900 border border-white/10 text-white rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-amber-400/50 transition-all cursor-pointer hover:bg-slate-800"
                                >
                                    {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <span className="text-slate-600 text-xs font-black italic px-2 mt-4">VS</span>
                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-bold text-slate-600 uppercase ml-1">Competitor</span>
                                <select
                                    value={comparisonBrand}
                                    onChange={(e) => setComparisonBrand(e.target.value)}
                                    className="bg-slate-900 border border-white/10 text-white rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-amber-400/50 transition-all cursor-pointer hover:bg-slate-800"
                                >
                                    {allBrands.map(b => (
                                        <option key={b} value={b} disabled={b.toLowerCase() === referenceBrand.toLowerCase()}>
                                            {b}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="h-10 w-px bg-white/10 mx-2 hidden sm:block mt-4" />

                            <div className="flex flex-col gap-1 mt-4">
                                <span className="text-[8px] font-bold text-slate-600 uppercase ml-1">Threshold</span>
                                <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-white/5">
                                    <button onClick={() => setMinConfidence(0.80)} className={`px-3 py-1 rounded-lg text-[9px] font-bold transition-all ${minConfidence === 0.80 ? 'bg-amber-400 text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>80% (★)</button>
                                    <button onClick={() => setMinConfidence(0.95)} className={`px-3 py-1 rounded-lg text-[9px] font-bold transition-all ${minConfidence === 0.95 ? 'bg-amber-400 text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>95% (★★)</button>
                                </div>
                            </div>

                            <div className="ml-auto hidden xl:flex flex-col items-end gap-1 mt-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col items-end leading-none">
                                        <span className="text-[10px] font-black text-white">{findBrandN(referenceBrand)}</span>
                                        <span className="text-[7px] font-bold text-slate-500 uppercase">Baseline N</span>
                                    </div>
                                    <div className="w-px h-6 bg-white/10" />
                                    <div className="flex flex-col items-end leading-none">
                                        <span className="text-[10px] font-black text-white">{findBrandN(comparisonBrand)}</span>
                                        <span className="text-[7px] font-bold text-slate-500 uppercase">Comp N</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div
                className={`overflow-y-auto custom-scrollbar border ${isDark ? 'border-white/5' : 'border-slate-200'} rounded-[24px]`}
                style={isFocusMode ? { height: presentationHeight ? (presentationHeight - 150) : 600 } : { maxHeight: '600px' }}
            >
                <div className="overflow-x-auto custom-scrollbar pb-4">
                    <div className="min-w-[1000px]">
                        <div style={gridStyle} className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] ${isDark ? 'text-slate-500' : 'text-slate-900'} border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <div className="col-span-3">Criteria</div>
                            <div className="text-center">Importance</div>
                            {visibleBrands.map((brand) => (
                                <div key={brand} className="text-center border-l border-white/5 pl-4">
                                    <span style={{ color: COLORS[allBrands.indexOf(brand) % COLORS.length] }}>{brand}</span>
                                </div>
                            ))}
                            <div className="text-center font-bold text-slate-400">Diff</div>
                            <div className="text-center font-bold text-slate-400">Sig.</div>
                        </div>

                        <AnimatePresence mode="popLayout">
                            {rows.map((row, index) => {
                                const sigColor = row.significance > 0.5 ? 'text-emerald-400' : row.significance > 0.3 ? 'text-amber-400' : 'text-slate-500';

                                const refScore = findBrandScore(row, referenceBrand);
                                const compScore = findBrandScore(row, comparisonBrand);
                                const currentDiff = Number((refScore - compScore).toFixed(1));

                                const refN = findBrandN(referenceBrand);
                                const compN = findBrandN(comparisonBrand);

                                const statResult = calculateProportionSig(refScore, refN, compScore, compN, true);
                                const isSignificant = statResult.level >= (minConfidence === 0.95 ? 2 : 1);

                                const diffPositive = currentDiff > 0;
                                const diffColor = isSignificant ? (diffPositive ? 'text-emerald-400' : 'text-rose-400') : (diffPositive ? 'text-emerald-400/60' : currentDiff === 0 ? 'text-slate-500' : 'text-rose-400/60');
                                const DiffIcon = diffPositive ? ArrowUpRight : currentDiff === 0 ? Minus : ArrowDownRight;

                                return (
                                    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={row.criteria_name} style={gridStyle} className={`group px-8 py-6 items-center transition-all ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-100'} ${index % 2 === 0 ? (isDark ? 'bg-white/[0.01]' : 'bg-slate-50') : ''} border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                        <div className="col-span-3 flex flex-col gap-1">
                                            <div className={`font-black ${isDark ? 'text-white' : 'text-slate-900'} text-sm uppercase tracking-tight group-hover:text-brand-blue transition-colors`}>{row.criteria_name}</div>
                                        </div>

                                        <div className={`text-center font-mono text-xs font-black ${sigColor} ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-100 border-slate-200'} py-1.5 rounded-lg border`}>{row.significance.toFixed(2)}</div>

                                        {visibleBrands.map((brand) => {
                                            const score = findBrandScore(row, brand);
                                            const isReference = brand.toLowerCase() === referenceBrand.toLowerCase();
                                            const baseColor = COLORS[allBrands.indexOf(brand) % COLORS.length];

                                            return (
                                                <div key={brand} className={`flex items-center gap-3 px-4 ${isReference ? (isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200') : ''} rounded-xl py-2 border border-transparent`}>
                                                    <div className={`flex-1 h-1.5 ${isDark ? 'bg-slate-800/50' : 'bg-slate-200'} rounded-full overflow-hidden`}>
                                                        <motion.div initial={{ width: 0 }} animate={{ width: `${(score / maxT2B) * 100}%` }} transition={{ duration: 1, ease: 'circOut' }} className="h-full rounded-full" style={{ backgroundColor: baseColor }} />
                                                    </div>
                                                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-slate-900'} font-mono min-w-[35px] text-right`}>{score.toFixed(0)}%</span>
                                                </div>
                                            );
                                        })}

                                        <div className={`flex flex-col items-center justify-center gap-0.5 font-mono text-xs font-black ${diffColor} py-2 rounded-xl group/diff`}>
                                            <div className="flex items-center gap-1">
                                                <DiffIcon className="h-3 w-3" />
                                                <span>{diffPositive ? '+' : ''}{currentDiff}%</span>
                                            </div>
                                        </div>

                                        <div className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl border transition-all relative group/sig ${isSignificant ? 'bg-white/5 border-white/10 border-amber-400/20' : 'bg-transparent border-transparent'}`}>
                                            {statResult.level > 0 ? (
                                                <>
                                                    <span className="text-[11px] text-amber-400 leading-none tracking-[0.1em] font-black">{"★".repeat(statResult.level)}</span>
                                                    <span className={`text-[7px] uppercase tracking-tighter font-black leading-none mt-0.5 ${isSignificant ? 'text-amber-400/80' : 'text-slate-500'}`}>{statResult.level >= 2 ? 'Significant' : 'Directional'}</span>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center opacity-40">
                                                    <span className="text-[9px] text-slate-700 font-bold uppercase tracking-widest italic leading-none">n.s.</span>
                                                    <span className="text-[6px] text-slate-600 font-mono mt-0.5">Z: {statResult.zScore.toFixed(2)}</span>
                                                </div>
                                            )}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-slate-900 border border-white/10 rounded-lg shadow-2xl opacity-0 group-hover/sig:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                                                <div className="text-[10px] font-black text-amber-400 uppercase mb-2 border-b border-white/5 pb-1">Stats Decoder</div>
                                                <div className="flex flex-col gap-1.5 text-[9px]">
                                                    <div className="flex justify-between gap-6"><span className="text-slate-400">Z-Score:</span> <span className="text-white font-mono">{statResult.zScore.toFixed(3)}</span></div>
                                                    <div className="flex justify-between gap-6"><span className="text-slate-400">Baseline N:</span> <span className="text-white font-mono">{refN}</span></div>
                                                    <div className="flex justify-between gap-6"><span className="text-slate-400">Comp N:</span> <span className="text-white font-mono">{compN}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-12 gap-y-4 px-8 py-6 bg-slate-900/40 border border-white/5 rounded-[25px]">
                <div className="flex items-center gap-6">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 border-r border-white/10 pr-6">Legend</div>
                    {allBrands.map((brand: string, idx: number) => (
                        <div key={brand} className="flex items-center gap-2.5">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{brand}</span>
                        </div>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-6 text-[9px]">
                    <div className="flex items-center gap-4 border-l border-white/10 pl-6">
                        <span className="text-slate-600 uppercase font-bold tracking-widest">Importance:</span>
                        <div className="flex items-center gap-3">
                            <span className="text-emerald-400/80 font-black">● Strong</span>
                            <span className="text-amber-400/80 font-black">● Moderate</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 border-l border-white/10 pl-6 text-white/50 font-black">
                        <span className="text-slate-600 uppercase">Significance:</span>
                        <span>★ 80%</span>
                        <span>★★ 95%</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
