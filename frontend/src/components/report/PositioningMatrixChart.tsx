import { useMemo, memo } from 'react';
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
    ReferenceLine
} from 'recharts';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { CHART_SERIES } from '../../constants/brandPalette';

const BRAND_COLORS = CHART_SERIES;

// Custom Tooltip component
const CustomTooltip = memo(({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload;

    return (
        <div className="bg-white/95 dark:bg-slate-900/98 backdrop-blur-3xl border border-slate-200 dark:border-white/20 p-5 rounded-[24px] shadow-2xl min-w-[220px]">
            <div className="flex items-center gap-3 mb-4 border-b border-line/80 dark:border-line/10 pb-3">
                <div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]" style={{ backgroundColor: data.color }} />
                <p className="font-black text-ink uppercase tracking-[0.15em] text-[10px]">{data.brand}</p>
            </div>
            <div className="space-y-3">
                <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 px-3 py-2 rounded-xl">
                    <span className="text-ink-muted text-[9px] font-black uppercase tracking-widest">Classification</span>
                    <span className="text-primary-soft font-black text-[10px] uppercase italic tracking-tighter">{data.quadrant}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-2">
                    <div className="flex justify-between items-center">
                        <span className="text-ink-muted text-[10px] font-bold uppercase tracking-tight">Market Momentum</span>
                        <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-200">{data.x > 0 ? '+' : ''}{data.x.toFixed(2)} σ</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-ink-muted text-[10px] font-bold uppercase tracking-tight">Quality Index</span>
                        <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-200">{data.y > 0 ? '+' : ''}{data.y.toFixed(2)} σ</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-line/80 dark:border-line/10">
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest italic">Sample Reach</span>
                        <span className="font-mono text-xs font-black text-emerald-500">N={data.n}</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

CustomTooltip.displayName = 'CustomTooltip';

interface PositioningMatrixProps {
    data: any;
    isFocusMode?: boolean;
    presentationHeight?: number;
}

export function PositioningMatrixChart({ data, isFocusMode, presentationHeight }: PositioningMatrixProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const points = useMemo(() => {
        if (!data?.datasets?.[0]?.data) return [];
        return data.datasets[0].data.map((p: any, idx: number) => ({
            ...p,
            color: BRAND_COLORS[idx % BRAND_COLORS.length]
        }));
    }, [data]);

    const axisColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    const gridColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    const labelColor = isDark ? '#94a3b8' : '#64748b';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative w-full h-full min-h-[500px]"
        >
            {/* Modern Quadrant Labels - Architectural Overlay */}
            <div className="absolute inset-x-0 inset-y-0 pointer-events-none grid grid-cols-2 grid-rows-2 p-12 opacity-60 dark:opacity-30">
                <div className="border-r border-b border-dashed border-line/80 dark:border-line/10 flex flex-col items-center justify-center p-8 text-center group">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-amber-500 mb-2">Exclusive</span>
                    <span className="text-[18px] font-black uppercase tracking-tighter text-slate-300 dark:text-slate-700 italic">Premium Niche</span>
                </div>
                <div className="border-b border-dashed border-line/80 dark:border-line/10 flex flex-col items-center justify-center p-8 text-center bg-emerald-500/[0.02]">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-emerald-500 mb-2">Dominant</span>
                    <span className="text-[18px] font-black uppercase tracking-tighter text-slate-300 dark:text-slate-700 italic">Market Leaders</span>
                </div>
                <div className="border-r border-dashed border-line/80 dark:border-line/10 flex flex-col items-center justify-center p-8 text-center bg-slate-500/[0.02]">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 mb-2">Emergent</span>
                    <span className="text-[18px] font-black uppercase tracking-tighter text-slate-300 dark:text-slate-700 italic">Followers</span>
                </div>
                <div className="flex flex-col items-center justify-center p-8 text-center">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-blue-500 mb-2">Functional</span>
                    <span className="text-[18px] font-black uppercase tracking-tighter text-slate-300 dark:text-slate-700 italic">Mass Challengers</span>
                </div>
            </div>

            <div className="relative z-10 w-full h-full">
                <ResponsiveContainer width="100%" height={isFocusMode ? (presentationHeight || 600) : 550}>
                    <ScatterChart margin={{ top: 60, right: 60, bottom: 80, left: 40 }}>
                        <CartesianGrid strokeDasharray="1 10" stroke={gridColor} vertical={true} />
                        <XAxis
                            type="number"
                            dataKey="x"
                            name="Market Momentum"
                            domain={['auto', 'auto']}
                            tick={{ fill: labelColor, fontSize: 10, fontWeight: 900 }}
                            axisLine={false}
                            tickLine={false}
                            label={{
                                value: 'MARKET MOMENTUM (MOU SHARE SIGMA)',
                                position: 'bottom',
                                offset: 40,
                                fill: labelColor,
                                fontSize: 9,
                                fontWeight: 900,
                                letterSpacing: '0.3em',
                                className: 'italic'
                            }}
                        />
                        <YAxis
                            type="number"
                            dataKey="y"
                            name="Quality Index"
                            domain={['auto', 'auto']}
                            tick={{ fill: labelColor, fontSize: 10, fontWeight: 900 }}
                            axisLine={false}
                            tickLine={false}
                            label={{
                                value: 'PRODUCT QUALITY (PERFORMANCE SIGMA)',
                                angle: -90,
                                position: 'insideLeft',
                                offset: 0,
                                fill: labelColor,
                                fontSize: 9,
                                fontWeight: 900,
                                letterSpacing: '0.3em',
                                className: 'italic'
                            }}
                        />
                        {/* ZAxis handles the radius (bubble size) */}
                        <ZAxis type="number" dataKey="r" range={[200, 3500]} />

                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ strokeDasharray: '5 5', stroke: axisColor, strokeWidth: 1 }}
                        />

                        {/* Strategic Crosshair */}
                        <ReferenceLine x={0} stroke={axisColor} strokeWidth={2} />
                        <ReferenceLine y={0} stroke={axisColor} strokeWidth={2} />

                        <Scatter
                            name="Brands"
                            data={points}
                            isAnimationActive={true}
                            animationDuration={1500}
                        >
                            {points.map((entry: any, index: number) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    fillOpacity={0.8}
                                    stroke={entry.color}
                                    strokeWidth={2}
                                    className="transition-all duration-500 hover:fill-opacity-100 hover:stroke-white dark:hover:stroke-slate-900"
                                    style={{
                                        filter: `drop-shadow(0 0 15px ${entry.color}60)`,
                                        cursor: 'pointer',
                                        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            </div>

            {/* Strategic Axis Legend */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-12 text-[8px] font-black uppercase tracking-[0.3em] text-ink-subtle bg-white/50 dark:bg-slate-900/50 backdrop-blur-md px-8 py-2 rounded-full border border-line/80 dark:border-line/10">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Positive Quality Delta</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>Market Dominance</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-sm" />
                    <span>Statistical Average</span>
                </div>
            </div>
        </motion.div>
    );
}

PositioningMatrixChart.displayName = 'PositioningMatrixChart';
