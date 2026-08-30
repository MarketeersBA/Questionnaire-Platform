import { useState } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { motion } from 'framer-motion';
import { CHART_SERIES } from '../../constants/brandPalette';
import { useTheme } from '../../context/ThemeContext';

const COLORS = CHART_SERIES;

const transformData = (raw: any) => {
    if (!raw || !raw.labels) return [];

    const attributes = [...raw.labels];

    return attributes.map((attr: string, index: number) => {
        const row: any = { name: attr };
        (raw.datasets || []).forEach((ds: any) => {
            const key = ds.brand || ds.label;
            row[key] = ds.data[index] ?? 0;
        });
        return row;
    });
};

const CustomDot = (props: any) => {
    const { cx, cy, stroke, value } = props;
    if (value === 0 || value === null) return null;

    return (
        <svg x={cx - 6} y={cy - 6} width={12} height={12}>
            <circle
                cx="6"
                cy="6"
                r="4"
                fill={stroke}
                stroke="rgb(var(--c-surface))"
                strokeWidth="2"
                className="drop-shadow-[0_1px_3px_rgba(15,23,42,0.35)]"
            />
        </svg>
    );
};

export function AttributeProfileChart({ data }: { data: any }) {
    // FIX: Backend returns data structure directly, no nested .data.data normally
    // But aggregator returns { "data": { "labels": [], "datasets": [] } }
    // So data prop is the result of aggregator call.
    // Advanced Safety: Handle nested or flat data structures
    const actualData = data?.data || data || {};
    const datasets = Array.isArray(actualData.datasets) ? actualData.datasets : [];

    // Defensive State Init
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [visibleBrands, setVisibleBrands] = useState<string[]>(() =>
        datasets.map((ds: any) => ds.brand || ds.label).filter(Boolean)
    );


    const toggleBrand = (brand: string) => {
        setVisibleBrands(prev =>
            prev.includes(brand)
                ? prev.filter(b => b !== brand)
                : [...prev, brand]
        );
    };

    const chartData = transformData(actualData);

    if (!chartData.length) {
        return (
            <div className="flex flex-col items-center justify-center h-[280px] text-slate-500 italic">
                No performance data available to display.
            </div>
        );
    }

    const allValues = chartData.flatMap((r: any) =>
        datasets.map((ds: any) => r[ds.brand || ds.label] || 0)
    );
    const maxVal = allValues.length ? Math.max(...allValues) : 0;
    const domain: [number, number] = maxVal > 5 ? [1, 10] : [1, 5];
    const mid = (domain[0] + domain[1]) / 2;
    const angled = chartData.length > 6;

    const legendLabel = (ds: any) => {
        const raw = String(ds.label || ds.brand || '').trim();
        // Drop sample-size suffixes like "(N=400)" from legend chips.
        return raw.replace(/\s*\(\s*n\s*=\s*\d+\s*\)\s*$/i, '').trim() || raw;
    };

    return (
        <div className="w-full flex flex-col gap-4">
            <div className="w-full h-[380px] relative">
                {/* Visual Gradient Background for Context (dislike → like on Y) */}
                <div className="absolute inset-0 flex flex-col pointer-events-none opacity-[0.03]">
                    <div className="flex-1 bg-gradient-to-b from-primary to-transparent" />
                    <div className="flex-1 bg-gradient-to-t from-accent to-transparent" />
                </div>

                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={chartData}
                        margin={{ top: 16, right: 24, left: 8, bottom: angled ? 68 : 28 }}
                    >
                        <defs>
                            {datasets.map((_ds: any, idx: number) => {
                                return (
                                    <filter key={`glow-${idx}`} id={`glow-${idx}`} x="-20%" y="-20%" width="140%" height="140%">
                                        <feGaussianBlur stdDeviation="3" result="blur" />
                                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                    </filter>
                                );
                            })}
                        </defs>

                        <CartesianGrid
                            horizontal={true}
                            vertical={false}
                            stroke={isDark ? '#FFFFFF' : '#0F172A'}
                            strokeOpacity={isDark ? 0.05 : 0.08}
                            strokeDasharray="4 4"
                        />

                        <XAxis
                            dataKey="name"
                            type="category"
                            interval={0}
                            angle={angled ? -35 : 0}
                            textAnchor={angled ? 'end' : 'middle'}
                            height={angled ? 72 : 36}
                            tick={{
                                fill: isDark ? '#E2E8F0' : '#1E293B',
                                fontSize: 11,
                                fontWeight: 800,
                            }}
                            axisLine={{ stroke: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.15)', strokeWidth: 1 }}
                            tickLine={false}
                        />

                        <YAxis
                            type="number"
                            domain={domain}
                            ticks={domain[1] === 10 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5]}
                            tick={{ fill: isDark ? '#94A3B8' : '#475569', fontSize: 10, fontWeight: 900 }}
                            axisLine={false}
                            tickLine={false}
                            width={36}
                            label={{
                                value: 'LIKE ↑',
                                angle: -90,
                                position: 'insideLeft',
                                offset: 0,
                                fill: isDark ? '#64748b' : '#64748b',
                                fontSize: 9,
                                fontWeight: 900,
                                letterSpacing: '0.12em',
                            }}
                        />

                        <Tooltip
                            cursor={{ stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(37,94,145,0.07)', strokeWidth: 40 }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-[#0f172a]/95 backdrop-blur-xl border border-white/20 p-5 rounded-3xl shadow-2xl min-w-[220px] animate-in zoom-in duration-200">
                                            <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-4 pb-2 border-b border-white/5 font-mono">
                                                {payload[0].payload.name}
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                {payload.map((entry: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center group">
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                                                                style={{ backgroundColor: entry.color }}
                                                            />
                                                            <span className="text-xs font-bold text-slate-300 uppercase tracking-tight">
                                                                {String(entry.name).replace(/\s*\(\s*n\s*=\s*\d+\s*\)\s*$/i, '').split('(')[0].trim()}
                                                            </span>
                                                        </div>
                                                        <span className="text-sm font-black text-white font-mono tabular-nums">
                                                            {Number(entry.value).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />

                        <ReferenceLine
                            y={mid}
                            stroke={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.18)'}
                            strokeDasharray="5 5"
                            label={{
                                position: 'insideTopRight',
                                value: `NEUTRAL (${mid})`,
                                fill: '#64748b',
                                fontSize: 9,
                                fontWeight: 900,
                                offset: 8,
                            }}
                        />

                        {datasets.map((ds: any, idx: number) => {
                            const brand = ds.brand || ds.label;
                            if (!visibleBrands.includes(brand)) return null;

                            const color = ds.is_benchmark ? '#94a3b8' : COLORS[idx % COLORS.length];

                            return (
                                <Line
                                    key={brand}
                                    type="monotone"
                                    dataKey={brand}
                                    name={legendLabel(ds) || brand}
                                    stroke={color}
                                    strokeWidth={ds.is_benchmark ? 3 : 4}
                                    strokeDasharray={ds.is_benchmark ? '10 5' : '0'}
                                    dot={<CustomDot />}
                                    activeDot={{
                                        r: 8,
                                        fill: color,
                                        stroke: '#fff',
                                        strokeWidth: 3,
                                        className: 'animate-pulse',
                                    }}
                                    connectNulls={true}
                                    isAnimationActive={true}
                                    animationDuration={1200}
                                    style={{
                                        filter: ds.is_benchmark ? 'none' : `url(#glow-${idx})`,
                                        opacity: ds.is_benchmark ? 0.6 : 1,
                                    }}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Legend under the chart */}
            <div className="flex flex-wrap justify-center gap-2">
                {datasets.map((ds: any, idx: number) => {
                    const brand = ds.brand || ds.label;
                    const isVisible = visibleBrands.includes(brand);
                    const color = ds.is_benchmark ? '#94a3b8' : COLORS[idx % COLORS.length];

                    return (
                        <motion.button
                            key={brand}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleBrand(brand)}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all duration-300
                                ${isVisible
                                    ? 'bg-primary/10 dark:bg-white/10 border-primary/25 dark:border-white/20 text-ink shadow-sm'
                                    : 'bg-transparent border-line/60 dark:border-white/5 text-ink-subtle grayscale opacity-45'}
                            `}
                        >
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                    backgroundColor: color,
                                    boxShadow: isVisible ? `0 0 10px ${color}` : 'none'
                                }}
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest">{legendLabel(ds)}</span>
                        </motion.button>
                    );
                })}
            </div>

            {/* Footnote about Benchmark */}
            <div className="flex items-center gap-2 text-[9px] text-slate-600 font-mono uppercase tracking-widest">
                <div className="w-8 h-0.5 border-t border-dashed border-slate-700" />
                <span>"OVERALL" serves as the market average benchmark across all evaluated brands.</span>
            </div>
        </div>
    );
}
