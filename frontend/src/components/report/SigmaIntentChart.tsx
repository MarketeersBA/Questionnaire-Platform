import { useMemo, useState } from 'react';
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
    ReferenceArea,
    Label
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, Zap, AlertTriangle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface DataPoint {
    brand: string;
    x: number; // Sigma
    y: number; // Intent %
    raw_mean: number;
    n: number;
    category_mean: number;
    category_std: number;
    color?: string;
}

interface SigmaIntentChartProps {
    data: {
        attributes: string[];
        datasets: Record<string, DataPoint[]>;
        correlations?: Record<string, number>;
        headlines?: Record<string, string>;
        default_attribute?: string;
    };
    isFocusMode?: boolean;
    presentationHeight?: number;
}

const BRAND_COLORS: string[] = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f43f5e', // Rose
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#ec4899', // Pink
];

export function SigmaIntentChart({ data, isFocusMode, presentationHeight }: SigmaIntentChartProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [selectedAttribute, setSelectedAttribute] = useState(
        data.default_attribute || (data.attributes && data.attributes[0]) || ''
    );
    const [showBenchmarking, setShowBenchmarking] = useState(true);

    const currentDataset = useMemo(() => {
        const rawData = data.datasets[selectedAttribute] || [];
        return rawData.map((d, i) => ({
            ...d,
            color: BRAND_COLORS[i % BRAND_COLORS.length]
        }));
    }, [data, selectedAttribute]);

    // Handle empty state
    if (!selectedAttribute || currentDataset.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-slate-400 font-medium">
                <Zap className="w-12 h-12 mb-4 opacity-20" />
                <p>No Sigma analytics found for this dimension.</p>
            </div>
        );
    }

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d: DataPoint = payload[0].payload;
            return (
                <div className="glass-panel bg-white/95 dark:bg-slate-900/95 p-6 rounded-[32px] border border-slate-200 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.2)] backdrop-blur-2xl min-w-[280px]">
                    <div className="flex items-center gap-4 mb-5 pb-4 border-b border-slate-100 dark:border-white/5">
                        <div className="w-4 h-4 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.1)]" style={{ backgroundColor: d.color, boxShadow: `0 0 20px ${d.color}44` }} />
                        <span className="font-black uppercase tracking-[0.2em] text-[12px] text-slate-900 dark:text-white">
                            {d.brand}
                        </span>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center group/item">
                            <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Sigma Score</span>
                            <div className="flex flex-col items-end">
                                <span className={`font-mono text-lg font-black leading-none ${d.x >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {d.x > 0 ? '+' : ''}{d.x.toFixed(2)}σ
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Perf. Index</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center group/item">
                            <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Purchase Intent</span>
                            <div className="flex flex-col items-end">
                                <span className="text-blue-500 dark:text-blue-400 font-mono text-lg font-black leading-none">
                                    {d.y.toFixed(1)}%
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">T2B Baseline</span>
                            </div>
                        </div>
                        <div className="pt-4 mt-2 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 gap-4">
                            <div className="flex flex-col">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Mean</span>
                                <span className="text-xs text-slate-600 dark:text-slate-300 font-black">{d.raw_mean}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Category Avg</span>
                                <span className="text-xs text-slate-600 dark:text-slate-300 font-black">{d.category_mean}</span>
                            </div>
                        </div>
                        <div className="px-3 py-2 bg-slate-100/50 dark:bg-white/5 rounded-xl border border-slate-200/50 dark:border-white/5">
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] text-slate-400 font-black uppercase">Sample Confidence</span>
                                <span className="text-xs text-slate-600 dark:text-slate-300 font-mono font-black">N={d.n}</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-col h-full gap-8">
            {/* 1. PREMIUM DIMENSION SELECTOR */}
            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 px-1">
                        <div className="w-10 h-10 rounded-2xl bg-brand-blue/10 flex items-center justify-center shadow-inner">
                            <Filter size={16} className="text-brand-blue" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 leading-none mb-1">Analytical Engine</span>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Dimension Mapping</h3>
                        </div>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowBenchmarking(!showBenchmarking)}
                        className={`flex items-center gap-3 px-6 py-2.5 rounded-2xl border text-[10px] font-black uppercase tracking-[0.2em] transition-all ${showBenchmarking
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 shadow-lg shadow-blue-500/5'
                            : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-400'
                            }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${showBenchmarking ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`} />
                        {showBenchmarking ? 'Benchmarks Live' : 'Enable Benchmarks'}
                    </motion.button>
                </div>

                <div className="flex flex-wrap gap-3">
                    {data.attributes.map((attr, idx) => (
                        <motion.button
                            key={attr}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedAttribute(attr)}
                            className={`px-6 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest transition-all relative overflow-hidden group/btn ${selectedAttribute === attr
                                ? 'text-white shadow-[0_10px_25px_rgba(59,130,246,0.3)]'
                                : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                                }`}
                        >
                            {selectedAttribute === attr && (
                                <motion.div
                                    layoutId="activeAttr"
                                    className="absolute inset-0 bg-gradient-to-br from-brand-blue to-blue-600 backdrop-blur-md -z-10"
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-2">
                                {selectedAttribute === attr && <Zap size={10} className="text-white/80 animate-pulse" />}
                                {attr}
                            </span>
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* 2. STATE-OF-THE-ART SCATTER MAP */}
            <div className="relative flex-1 min-h-[550px] glass-panel bg-white/40 dark:bg-slate-900/40 rounded-[48px] border border-slate-200/60 dark:border-white/10 shadow-2xl backdrop-blur-3xl p-8 overflow-hidden group/canvas">
                {/* Background Textures */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue/20 to-transparent" />
                <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-brand-blue/20 to-transparent" />

                {/* Quadrant Labels Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.05] dark:opacity-[0.1] flex flex-wrap transition-opacity group-hover/canvas:opacity-[0.08] dark:group-hover/canvas:opacity-[0.15]">
                    <div className="w-1/2 h-1/2 border-r border-b border-slate-900 dark:border-white flex items-center justify-center p-12">
                        <span className="text-6xl font-black uppercase -rotate-12 select-none text-center leading-none">Leveraged<br />Gap</span>
                    </div>
                    <div className="w-1/2 h-1/2 border-b border-slate-900 dark:border-white flex items-center justify-center p-12">
                        <span className="text-6xl font-black uppercase -rotate-12 select-none text-center leading-none text-brand-blue">Growth<br />Driver</span>
                    </div>
                    <div className="w-1/2 h-1/2 border-r border-slate-900 dark:border-white flex items-center justify-center p-12">
                        <span className="text-6xl font-black uppercase -rotate-12 select-none text-center leading-none text-rose-500">High<br />Risk</span>
                    </div>
                    <div className="w-1/2 h-1/2 flex items-center justify-center p-12">
                        <span className="text-6xl font-black uppercase -rotate-12 select-none text-center leading-none">Unused<br />Edge</span>
                    </div>
                </div>

                {/* Legend Icons */}
                <div className="absolute top-10 left-10 flex flex-col gap-8 z-10">
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shadow-lg"><Zap size={18} /></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Leading Advantage</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Postive Sigma Variance</span>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shadow-lg"><AlertTriangle size={18} /></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">Market Trailing</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Negative Sigma Variance</span>
                        </div>
                    </motion.div>
                </div>

                <ResponsiveContainer width="100%" height={isFocusMode ? (presentationHeight || 600) : 550}>
                    <ScatterChart margin={{ top: 60, right: 80, bottom: 60, left: 20 }}>
                        <CartesianGrid
                            strokeDasharray="4 4"
                            vertical={true}
                            horizontal={true}
                            stroke={isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}
                        />

                        <XAxis
                            type="number"
                            dataKey="x"
                            name="Sigma"
                            domain={[
                                (dataMin: number) => Math.min(dataMin, -1.2),
                                (dataMax: number) => Math.max(dataMax, 1.2)
                            ]}
                            tick={{ fill: isDark ? '#64748b' : '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: '0.05em' }}
                            axisLine={false}
                            tickLine={false}
                            padding={{ left: 20, right: 20 }}
                        >
                            <Label value="Performance Sigma (Category Z-Score)" offset={-35} position="insideBottom" fill={isDark ? '#475569' : '#94a3b8'} style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.3em' }} />
                        </XAxis>

                        <YAxis
                            type="number"
                            dataKey="y"
                            name="Intent"
                            unit="%"
                            domain={[0, 100]}
                            tick={{ fill: isDark ? '#64748b' : '#94a3b8', fontSize: 11, fontWeight: 900 }}
                            axisLine={false}
                            tickLine={false}
                        >
                            <Label value="Purchase Intent Baseline (%)" angle={-90} position="insideLeft" offset={15} fill={isDark ? '#475569' : '#94a3b8'} style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.3em' }} />
                        </YAxis>

                        <ZAxis type="number" dataKey="y" range={[500, 3500]} />

                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ stroke: 'rgba(59,130,246,0.2)', strokeWidth: 2, strokeDasharray: '10 10' }}
                        />

                        {showBenchmarking && (
                            <>
                                <ReferenceArea
                                    x1={-1}
                                    x2={1}
                                    fill={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'}
                                    stroke="none"
                                >
                                    <Label
                                        value="AVERAGE ZONE"
                                        position="insideBottom"
                                        offset={15}
                                        fill={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}
                                        style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.5em', pointerEvents: 'none' }}
                                    />
                                </ReferenceArea>
                                <ReferenceLine x={0} stroke={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} strokeWidth={2} strokeDasharray="12 12">
                                    <Label
                                        value="MARKET MEAN"
                                        position="top"
                                        offset={25}
                                        fill={isDark ? '#94a3b8' : '#64748b'}
                                        style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.2em', textShadow: isDark ? '0 0 10px rgba(0,0,0,0.5)' : 'none' }}
                                    />
                                </ReferenceLine>

                                {/* Sigma Dimensions (Zones) */}
                                <ReferenceLine x={-1} stroke={isDark ? 'rgba(244,63,94,0.3)' : 'rgba(244,63,94,0.2)'} strokeWidth={1} strokeDasharray="8 8">
                                    <Label
                                        value="UNDERPERFORMING (-1σ)"
                                        position="insideTopLeft"
                                        offset={10}
                                        fill="#f43f5e"
                                        style={{ fontSize: '8px', fontWeight: 900, letterSpacing: '0.1em', opacity: 0.6 }}
                                    />
                                </ReferenceLine>
                                <ReferenceLine x={1} stroke={isDark ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.2)'} strokeWidth={1} strokeDasharray="8 8">
                                    <Label
                                        value="OUTPERFORMING (+1σ)"
                                        position="insideTopRight"
                                        offset={10}
                                        fill="#10b981"
                                        style={{ fontSize: '8px', fontWeight: 900, letterSpacing: '0.1em', opacity: 0.6 }}
                                    />
                                </ReferenceLine>
                            </>
                        )}

                        {showBenchmarking && (
                            <ReferenceLine y={50} stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} strokeWidth={1.5} />
                        )}

                        <Scatter
                            name="Brands"
                            data={currentDataset}
                            isAnimationActive={true}
                            animationDuration={1500}
                            animationEasing="ease-in-out"
                        >
                            {currentDataset.map((entry) => (
                                <Cell
                                    key={`cell-${entry.brand}-${selectedAttribute}`}
                                    fill={entry.color}
                                    fillOpacity={0.4}
                                    stroke={entry.color}
                                    strokeWidth={3}
                                    className="drop-shadow-[0_10px_15px_rgba(0,0,0,0.1)] transition-all duration-700 hover:fill-opacity-95 hover:stroke-width-6 cursor-pointer"
                                />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            </div>

            {/* 3. AI-POWERED CATEGORY SYNTHESIS FOOTER */}
            <motion.div
                layout
                className="flex flex-col gap-6 p-10 bg-gradient-to-br from-brand-blue/10 via-brand-blue/5 to-transparent dark:from-white/5 dark:via-white/[0.02] dark:to-transparent rounded-[48px] border border-brand-blue/20 dark:border-white/10 relative overflow-hidden group shadow-2xl"
            >
                <div className="absolute top-0 right-0 w-80 h-80 bg-brand-blue/10 rounded-full blur-[100px] -mr-40 -mt-40 transition-all duration-1000 group-hover:bg-brand-blue/20" />

                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-[24px] bg-brand-blue/20 dark:bg-brand-blue/30 flex items-center justify-center text-brand-blue shadow-[0_10px_30px_rgba(59,130,246,0.2)]">
                            <Zap size={28} className="drop-shadow-lg" />
                        </div>
                        <div className="flex flex-col">
                            <h4 className="text-[12px] font-black uppercase tracking-[0.5em] text-brand-blue mb-1">Sigma Strategic Synthesis</h4>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none opacity-60">Category Driver Identification Engine</span>
                        </div>
                    </div>

                    {data.correlations?.[selectedAttribute] !== undefined && (
                        <div className="flex flex-col items-end px-10 border-l border-slate-200 dark:border-white/10">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Correlation Strength</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-brand-blue font-mono tabular-nums leading-none">
                                    {data.correlations[selectedAttribute].toFixed(2)}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">/ 1.0</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="relative z-10 space-y-5">
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={selectedAttribute}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="text-2xl font-black text-slate-900 dark:text-white leading-tight tracking-tight max-w-4xl"
                        >
                            {data.headlines?.[selectedAttribute] || `Synthesizing market behavior for ${selectedAttribute}...`}
                        </motion.p>
                    </AnimatePresence>

                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-4xl opacity-80 font-medium">
                        This automated analysis isolates how <strong>{selectedAttribute}</strong> standard deviations (Sigma) predict shifts in consumer <strong>Purchase Intent</strong>.
                        Attributes with correlation coefficients exceeding 0.6 are identified as "Core Intent Pillars," while those below 0.3 represent "Brand Flavor" metrics with less conversion velocity.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}

SigmaIntentChart.displayName = 'SigmaIntentChart';
