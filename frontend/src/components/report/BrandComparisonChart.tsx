import { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LabelList
} from 'recharts';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { chartChrome } from '../../constants/brandPalette';
import { buildBrandComparisonChartRows, resolveBrandComparisonSeries } from '../../utils/brandComparisonSeries';

interface BrandComparisonChartProps {
    data: any;
    isFocusMode?: boolean;
    presentationHeight?: number;
}

export function BrandComparisonChart({ data, isFocusMode, presentationHeight }: BrandComparisonChartProps) {
    const { theme } = useTheme();
    const chrome = chartChrome(theme === 'dark');
    const isDark = theme === 'dark';
    const [visibleBrands, setVisibleBrands] = useState<string[]>([]);

    const rawLabels = data?.labels || [];
    const resolved = useMemo(() => resolveBrandComparisonSeries(data), [data]);
    const likabilityDomain = resolved.likabilityDomain;

    const fullData = useMemo(() => buildBrandComparisonChartRows(data), [data]);

    // Sync visibility state
    if (visibleBrands.length === 0 && rawLabels.length > 0) {
        setVisibleBrands(rawLabels);
    }

    const filteredData = useMemo(() => {
        return fullData.filter((item: any) => visibleBrands.includes(item.name));
    }, [fullData, visibleBrands]);

    const toggleBrand = (brand: string) => {
        setVisibleBrands(prev =>
            prev.includes(brand)
                ? prev.filter(b => b !== brand)
                : [...prev, brand]
        );
    };

    const containerHeight = isFocusMode ? (presentationHeight || 600) : Math.max(400, filteredData.length * 60 + 120);

    const PI_GRADIENT = ["#ec4899", "#8b5cf6"]; // Rose to Violet
    const OL_GRADIENT = ["#10b981", "#06b6d4"]; // Emerald to Cyan

    return (
        <div className="w-full flex flex-col gap-8 py-4">
            {/* GLASSMORPHIC BRAND TOGGLES */}
            <div className={`p-4 rounded-[2rem] border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'} backdrop-blur-xl shrink-0 overflow-x-auto`}>
                <div className="flex flex-wrap gap-2">
                    {rawLabels.map((brand: string, idx: number) => {
                        const isVisible = visibleBrands.includes(brand);
                        return (
                            <motion.button
                                key={brand}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => toggleBrand(brand)}
                                className={`
                                    flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300
                                    ${isVisible
                                        ? 'bg-primary/10 border-primary/20 text-primary-soft shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                        : 'bg-transparent border-line/80 dark:border-line/10 text-slate-400 opacity-40'}
                                `}
                            >
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                        backgroundColor: isVisible ? PI_GRADIENT[idx % PI_GRADIENT.length] : '#94a3b8',
                                        boxShadow: isVisible ? `0 0 8px ${PI_GRADIENT[idx % PI_GRADIENT.length]}` : 'none'
                                    }}
                                />
                                <span className="text-[10px] font-black uppercase tracking-widest">{brand}</span>
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* STRATEGIC INSIGHT HEADER */}
            {data?.insight && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-6 rounded-[2rem] border ${isDark ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'} flex items-start gap-4`}
                >
                    <div className="p-2 bg-indigo-500 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Strategic AI Insight</div>
                        <p className={`text-sm font-bold leading-relaxed ${isDark ? 'text-indigo-200' : 'text-indigo-900'}`}>
                            {data.insight}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* DUAL CHART GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" style={{ height: containerHeight }}>
                {/* LEFT: PURCHASE INTENT */}
                <div className={`rounded-[2.5rem] p-8 border ${isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'} shadow-2xl relative overflow-hidden group`}>
                    <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                        <h4 className="text-8xl font-black italic uppercase tracking-tighter">Conversion</h4>
                    </div>
                    <div className="mb-6 relative z-10">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-500 mb-1">Purchase Intent</div>
                        <h4 className={`text-xl font-black italic uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Conversion Potential</h4>
                    </div>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart syncId="brandSync" layout="vertical" data={filteredData} margin={{ top: 20, right: 40, left: 20, bottom: 20 }}>
                            <defs>
                                <linearGradient id="piGradient" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor={PI_GRADIENT[0]} />
                                    <stop offset="100%" stopColor={PI_GRADIENT[1]} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid horizontal={false} vertical={true} stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                            <XAxis type="number" domain={[0, 100]} hide />
                            <YAxis
                                type="category"
                                dataKey="name"
                                tick={{ fill: isDark ? '#e2e8f0' : '#1e293b', fontSize: 11, fontWeight: 900 }}
                                width={100}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                contentStyle={{ borderRadius: '14px', border: `1px solid ${chrome.tooltipBorder}`, backgroundColor: chrome.tooltipBg, color: chrome.label, fontWeight: 700 }}
                                formatter={(val: number) => [`${val}%`, 'Intent T2B%']}
                            />
                            <Bar
                                dataKey="pi"
                                fill="url(#piGradient)"
                                radius={[0, 12, 12, 0]}
                                barSize={32}
                                isAnimationActive={true}
                            >
                                <LabelList
                                    dataKey="pi"
                                    position="right"
                                    formatter={(v: number) => `${v}%`}
                                    style={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: 800 }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* RIGHT: OVERALL LIKABILITY */}
                <div className={`rounded-[2.5rem] p-8 border ${isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'} shadow-2xl relative overflow-hidden group`}>
                    <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                        <h4 className="text-8xl font-black italic uppercase tracking-tighter">Sentiment</h4>
                    </div>
                    <div className="mb-6 relative z-10">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-1">Overall Likability</div>
                        <h4 className={`text-xl font-black italic uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Brand Affinity Score</h4>
                    </div>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart syncId="brandSync" layout="vertical" data={filteredData} margin={{ top: 20, right: 40, left: 20, bottom: 20 }}>
                            <defs>
                                <linearGradient id="olGradient" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor={OL_GRADIENT[0]} />
                                    <stop offset="100%" stopColor={OL_GRADIENT[1]} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid horizontal={false} vertical={true} stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                            <XAxis type="number" domain={likabilityDomain} hide />
                            <YAxis
                                type="category"
                                dataKey="name"
                                tick={{ fill: isDark ? '#e2e8f0' : '#1e293b', fontSize: 11, fontWeight: 900 }}
                                width={100}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                contentStyle={{ borderRadius: '14px', border: `1px solid ${chrome.tooltipBorder}`, backgroundColor: chrome.tooltipBg, color: chrome.label, fontWeight: 700 }}
                                formatter={(val: number) => [val.toFixed(2), 'Affinity Score']}
                            />
                            <Bar
                                dataKey="ol"
                                fill="url(#olGradient)"
                                radius={[0, 12, 12, 0]}
                                barSize={32}
                                isAnimationActive={true}
                            >
                                <LabelList
                                    dataKey="ol"
                                    position="right"
                                    formatter={(v: number) => v.toFixed(2)}
                                    style={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: 800 }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
