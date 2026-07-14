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

const COLORS = [
    '#60a5fa', // Blue
    '#34d399', // Emerald
    '#fb7185', // Rose
    '#fbbf24', // Amber
    '#a78bfa', // Violet
    '#22d3ee', // Cyan
];

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
        <svg x={cx - 6} y={cy - 6} width={12} height={12} fill="white">
            <circle
                cx="6"
                cy="6"
                r="4"
                fill={stroke}
                stroke="white"
                strokeWidth="2"
                className="drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]"
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
            <div className="flex flex-col items-center justify-center h-[400px] text-slate-500 italic">
                No performance data available to display.
            </div>
        );
    }

    const allValues = chartData.flatMap((r: any) =>
        datasets.map((ds: any) => r[ds.brand || ds.label] || 0)
    );
    const maxVal = allValues.length ? Math.max(...allValues) : 0;
    const domain: [number, number] = maxVal > 5 ? [1, 10] : [1, 5];

    return (
        <div className="w-full mt-4 flex flex-col gap-6">
            {/* Advanced Interactive Legend */}
            <div className="flex flex-wrap gap-2 mb-6">
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
                                    ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]'
                                    : 'bg-transparent border-white/5 text-slate-500 grayscale opacity-40'}
                            `}
                        >
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                    backgroundColor: color,
                                    boxShadow: isVisible ? `0 0 10px ${color}` : 'none'
                                }}
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest">{ds.label}</span>
                        </motion.button>
                    );
                })}
            </div>

            <div className="w-full h-[700px] relative">
                {/* Visual Gradient Background for Context */}
                <div className="absolute inset-0 flex pointer-events-none opacity-[0.03]">
                    <div className="flex-1 bg-gradient-to-r from-red-500 to-transparent" />
                    <div className="flex-1 bg-gradient-to-r from-transparent to-emerald-500" />
                </div>

                {/* Semantic Scale Labels */}
                <div className="flex justify-between items-center max-w-[calc(100%-160px)] ml-[140px] mb-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    <span className="flex items-center gap-3">
                        <span className="text-red-400/50">Dislike</span>
                        <div className="w-16 h-px bg-slate-800" />
                    </span>
                    <span className="text-slate-400 bg-slate-800/80 px-4 py-1.5 rounded-full border border-white/5 backdrop-blur-sm">
                        Neutral ({(domain[0] + domain[1]) / 2})
                    </span>
                    <span className="flex items-center gap-3">
                        <div className="w-16 h-px bg-slate-800" />
                        <span className="text-emerald-400/50">Like</span>
                    </span>
                </div>

                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        layout="vertical"
                        data={chartData}
                        margin={{ top: 20, right: 40, left: 140, bottom: 40 }}
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
                            vertical={true}
                            stroke="white"
                            strokeOpacity={0.03}
                            strokeDasharray="4 4"
                        />

                        <XAxis
                            type="number"
                            domain={domain}
                            orientation="top"
                            ticks={domain[1] === 10 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5]}
                            tick={{ fill: '#475569', fontSize: 10, fontWeight: 900 }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <YAxis
                            yAxisId="0"
                            dataKey="name"
                            type="category"
                            tick={(props: any) => {
                                const { x, y, payload } = props;
                                return (
                                    <g transform={`translate(${x},${y})`}>
                                        <text
                                            x={-10}
                                            y={0}
                                            dy={4}
                                            textAnchor="end"
                                            fill="#f8fafc"
                                            fontSize={10}
                                            fontWeight={900}
                                            className="uppercase tracking-wider"
                                        >
                                            {payload.value}
                                        </text>
                                    </g>
                                );
                            }}
                            width={130}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                            tickLine={false}
                        />

                        <Tooltip
                            cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 40 }}
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
                                                                {entry.name.split('(')[0].trim()}
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
                            x={(domain[0] + domain[1]) / 2}
                            stroke="rgba(255,255,255,0.15)"
                            strokeDasharray="5 5"
                            label={{
                                position: 'insideBottomRight',
                                value: 'NEUTRAL',
                                fill: '#475569',
                                fontSize: 9,
                                fontWeight: 900,
                                offset: 10
                            }}
                        />

                        {datasets.map((ds: any, idx: number) => {
                            const brand = ds.brand || ds.label;
                            if (!visibleBrands.includes(brand)) return null;

                            const color = ds.is_benchmark ? '#94a3b8' : COLORS[idx % COLORS.length];

                            return (
                                <Line
                                    key={brand}
                                    yAxisId="0"
                                    type="monotone"
                                    dataKey={brand}
                                    name={ds.label || brand}
                                    stroke={color}
                                    strokeWidth={ds.is_benchmark ? 3 : 5}
                                    strokeDasharray={ds.is_benchmark ? "10 5" : "0"}
                                    dot={<CustomDot />}
                                    activeDot={{
                                        r: 8,
                                        fill: color,
                                        stroke: '#fff',
                                        strokeWidth: 3,
                                        className: "animate-pulse"
                                    }}
                                    connectNulls={true}
                                    isAnimationActive={true}
                                    animationDuration={1500}
                                    style={{
                                        filter: ds.is_benchmark ? 'none' : `url(#glow-${idx})`,
                                        opacity: ds.is_benchmark ? 0.6 : 1
                                    }}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Footnote about Benchmark */}
            <div className="flex items-center gap-2 text-[9px] text-slate-600 font-mono uppercase tracking-widest ml-[140px]">
                <div className="w-8 h-0.5 border-t border-dashed border-slate-700" />
                <span>"OVERALL" serves as the market average benchmark across all evaluated brands.</span>
            </div>
        </div>
    );
}
