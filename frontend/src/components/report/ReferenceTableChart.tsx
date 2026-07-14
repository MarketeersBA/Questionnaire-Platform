import { useState, useMemo } from 'react';
import { Target, Filter, ChevronRight, BarChart2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

interface RowDefinition {
    key: string;
    label: string;
}

interface ReferenceTableChartProps {
    data: {
        row_definitions: RowDefinition[];
        brands: string[];
        brand_data: Record<string, Record<string, number>>;
        averages: Record<string, number>;
        my_brand?: string;
    };
    isFocusMode?: boolean;
}

export function ReferenceTableChart({ data, isFocusMode }: ReferenceTableChartProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [referenceKey, setReferenceKey] = useState<string>('AVERAGE');

    const brands = data.brands || [];

    // Derived state: what is being compared
    const referenceLabel = referenceKey === 'AVERAGE' ? 'Overall Average' : referenceKey;
    const otherBrands = useMemo(() => {
        if (referenceKey === 'AVERAGE') return brands;
        return brands.filter((b: string) => b !== referenceKey);
    }, [brands, referenceKey]);

    const getRowValue = (brand: string, metricKey: string) => {
        if (brand === 'AVERAGE') return data.averages[metricKey] || 0;
        return data.brand_data[brand]?.[metricKey] || 0;
    };

    const getHighlightColor = (value: number, reference: number) => {
        const threshold = 0.001; // small float epsilon
        if (value > reference + threshold) return 'text-emerald-400';
        if (value < reference - threshold) return 'text-rose-400';
        return 'text-amber-400';
    };

    const getHighlightIcon = (value: number, reference: number) => {
        const threshold = 0.001;
        if (value > reference + threshold) return <TrendingUp className="h-3 w-3" />;
        if (value < reference - threshold) return <TrendingDown className="h-3 w-3" />;
        return <Minus className="h-3 w-3" />;
    };

    // Advanced Scalable Grid Logic
    // In focus mode, we force everything into the viewport. 
    // In standard mode, we allow horizontal scrolling for maximum legibility.
    const stickyCol1Width = isFocusMode ? '180px' : '250px';
    const stickyCol2Width = isFocusMode ? '120px' : '180px';

    const gridTemplate = `${stickyCol1Width} ${stickyCol2Width} repeat(${otherBrands.length}, ${isFocusMode ? '1fr' : '140px'})`;

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        gap: isFocusMode ? '0.75rem' : '1.5rem',
        width: isFocusMode ? '100%' : 'max-content'
    };

    return (
        <div className="w-full h-full flex flex-col gap-4 overflow-hidden">
            {/* Filter Header - Compact in Focus Mode */}
            <div className={`${isFocusMode ? 'p-4' : 'p-6'} rounded-[32px] border backdrop-blur-xl ${isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'} transition-all duration-500 shrink-0`}>
                <div className="flex flex-wrap items-center gap-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            <Filter className="h-3 w-3" />
                            Reference Baseline
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            <button
                                onClick={() => setReferenceKey('AVERAGE')}
                                className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${referenceKey === 'AVERAGE' ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' : (isDark ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-white border-slate-200 text-slate-500')}`}
                            >
                                Overall Average
                            </button>
                            {brands.map((brand) => (
                                <button
                                    key={brand}
                                    onClick={() => setReferenceKey(brand)}
                                    className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${referenceKey === brand ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' : (isDark ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-white border-slate-200 text-slate-500')}`}
                                >
                                    {brand}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col gap-2 hidden md:flex">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                <Target className="h-3 w-3" />
                                Benchmarking Logic
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-brand-blue uppercase italic">{referenceLabel}</span>
                                <ChevronRight className="h-3 w-3 text-slate-600" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase">{otherBrands.length} Brands Compared</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Area - Flex Driven for Perfect Vertical Fit */}
            <div
                className={`flex-1 flex flex-col overflow-auto custom-scrollbar border ${isDark ? 'border-white/5' : 'border-slate-200'} rounded-[32px] bg-black/5`}
                style={isFocusMode ? { height: '100%' } : { maxHeight: '600px' }}
            >
                {/* Header Row */}
                <div style={gridStyle} className={`px-8 py-4 text-[9px] font-black uppercase tracking-[0.3em] ${isDark ? 'text-slate-500' : 'text-slate-900'} border-b ${isDark ? 'border-white/10' : 'border-slate-200'} sticky top-0 ${isDark ? 'bg-slate-900' : 'bg-white'} z-30 shrink-0`}>
                    <div className={`sticky left-0 ${isDark ? 'bg-slate-900' : 'bg-white'} z-10 pr-4`}>Funnel Metric</div>
                    <div className={`sticky z-10 text-center ${isDark ? 'bg-slate-900' : 'bg-white'} px-2`} style={{ left: stickyCol1Width }}>
                        <div className="bg-brand-blue text-white rounded-lg py-1.5 shadow-lg shadow-brand-blue/20 w-full">
                            Ref: {referenceKey === 'AVERAGE' ? 'AVG' : referenceKey}
                        </div>
                    </div>
                    {otherBrands.map((brand) => (
                        <div key={brand} className="text-center opacity-60 flex items-center justify-center p-1 truncate">{brand}</div>
                    ))}
                </div>

                {/* Data Rows Container - Flex-1 ensures it fills available height */}
                <div className={`flex-1 flex flex-col ${isFocusMode ? 'min-h-0' : ''}`}>
                    {data.row_definitions.map((def, rowIndex) => {
                        const refValue = getRowValue(referenceKey, def.key);

                        return (
                            <motion.div
                                key={def.key}
                                initial={isFocusMode ? false : { opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: rowIndex * 0.03 }}
                                style={gridStyle}
                                className={`flex-1 group px-8 items-center border-b ${isDark ? 'border-white/5' : 'border-slate-100'} transition-all duration-300 ${rowIndex % 2 === 0 ? (isDark ? 'bg-white/[0.01]' : 'bg-slate-50/50') : ''} min-h-0`}
                            >
                                <div className={`flex items-center gap-3 py-2 sticky left-0 z-10 ${isDark ? (rowIndex % 2 === 0 ? 'bg-[#0d1525]' : 'bg-[#0f172a]') : (rowIndex % 2 === 0 ? 'bg-[#fcfdfe]' : 'bg-white')} pr-4 transition-colors`}>
                                    <div className={`p-1.5 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'} group-hover:scale-110 group-hover:bg-brand-blue/10 transition-all`}>
                                        <BarChart2 className="h-3.5 w-3.5 text-brand-blue" />
                                    </div>
                                    <span className={`text-[11px] font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'} uppercase truncate`}>
                                        {def.label}
                                    </span>
                                </div>

                                <div className={`sticky z-10 text-center font-mono text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'} py-2 my-1 px-2 ${isDark ? (rowIndex % 2 === 0 ? 'bg-[#0d1525]' : 'bg-[#0f172a]') : (rowIndex % 2 === 0 ? 'bg-[#fcfdfe]' : 'bg-white')} transition-colors`} style={{ left: stickyCol1Width }}>
                                    <div className="bg-brand-blue/5 rounded-xl py-1 w-full h-full flex items-center justify-center border border-brand-blue/10">
                                        {(refValue * 100).toFixed(0)}%
                                    </div>
                                </div>

                                {otherBrands.map((brand) => {
                                    const val = getRowValue(brand, def.key);
                                    const colorClass = getHighlightColor(val, refValue);

                                    return (
                                        <div key={brand} className="flex flex-col items-center justify-center py-1 group/brand">
                                            <div className="flex items-center gap-1.5 min-w-[50px] justify-center">
                                                <span className={`text-xs font-black font-mono transition-transform duration-300 group-hover/brand:scale-110 ${val > refValue ? 'text-emerald-400' : val < refValue ? 'text-rose-400' : 'text-slate-400'}`}>
                                                    {(val * 100).toFixed(0)}%
                                                </span>
                                                <div className={`${colorClass} opacity-80 shrink-0`}>
                                                    {getHighlightIcon(val, refValue)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Legend - Compact in Focus Mode */}
            <div className={`flex items-center justify-between ${isFocusMode ? 'px-8 py-3' : 'px-10 py-5'} rounded-[24px] border ${isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'} shrink-0`}>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        <span className="text-[9px] font-black uppercase text-slate-500">Outperforming</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]" />
                        <span className="text-[9px] font-black uppercase text-slate-500">Underperforming</span>
                    </div>
                </div>
                {!isFocusMode && (
                    <div className="text-[9px] font-black uppercase italic text-brand-blue tracking-[0.2em] opacity-50">
                        Live Benchmark Active
                    </div>
                )}
            </div>
        </div>
    );
}
