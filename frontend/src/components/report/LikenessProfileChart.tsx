import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
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
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Info } from 'lucide-react';

const COLORS = [
    '#60a5fa', // Blue
    '#34d399', // Emerald
    '#fb7185', // Rose
    '#fbbf24', // Amber
    '#a78bfa', // Violet
    '#22d3ee', // Cyan
];

const transformData = (raw: any) => {
    if (!raw || !raw.metrics) return [];

    return raw.metrics.map((metric: string, index: number) => {
        const row: any = {
            id: `m-${index}`,
            name: metric || `Metric ${index + 1}`,
            left: raw.labels_left?.[index] || '',
            right: raw.labels_right?.[index] || ''
        };
        (raw.datasets || []).forEach((ds: any) => {
            const key = ds.brand || ds.label;
            if (key) {
                row[key] = ds.data?.[index] ?? 0;
            }
        });
        return row;
    });
};

const CustomDot = (props: any) => {
    const { cx, cy, stroke, value } = props;
    if (value === undefined || value === null || isNaN(Number(value))) return null;

    // Use a hash of the payload name to ensure unique filter IDs if necessary, 
    // but for now, a standard ID is fine as long as we define it once per chart.
    return (
        <g className="filter drop-shadow-lg">
            <circle
                cx={cx}
                cy={cy}
                r="6"
                fill={stroke}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="2.5"
            />
            <circle
                cx={cx}
                cy={cy}
                r="2.5"
                fill="white"
                style={{ opacity: 0.9 }}
            />
        </g>
    );
};

import { useTheme } from '../../context/ThemeContext';

export function LikenessProfileChart({ data, isFocusMode, presentationHeight }: { data: any, isFocusMode?: boolean, presentationHeight?: number }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const { surveyId } = useParams();
    const [registry, setRegistry] = useState<any[]>([]);
    const [visibleBrands, setVisibleBrands] = useState<string[]>([]);

    // 1. DYNAMIC REGISTRY FETCH : SYSTEMATIC & DYNAMIC FIX
    useEffect(() => {
        if (!surveyId) return;
        fetch(`/api/analytics/survey/${surveyId}/registry/full`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(reg => {
                if (Array.isArray(reg)) {
                    setRegistry(reg);
                }
            })
            .catch(err => console.warn("[RegistryFetch] Failed, using report defaults", err));
    }, [surveyId]);

    // Hardened Data Processing
    const actualData = data?.data || data || {};
    const datasets = Array.isArray(actualData.datasets) ? actualData.datasets : [];

    // 2. DATA MERGING & GROUPING : CATEGORIZE BY MAIN ATTRIBUTE
    const groupedData = useMemo(() => {
        const baseData = transformData(actualData);
        const mapped = baseData.map((row: any) => {
            const match = (registry || []).find(r =>
                `(${r.main_att} ${r.supp_att})` === row.name
            );

            return {
                ...row,
                main_att: match?.main_att || 'General Attributes',
                left: match?.min_label || row.left,
                right: match?.max_label || row.right
            };
        });

        const groups: Record<string, any[]> = {};
        mapped.forEach((row: any) => {
            const groupName = row.main_att;
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(row);
        });

        return Object.entries(groups).map(([name, metrics]) => ({
            name,
            metrics
        }));
    }, [actualData, registry]);

    // Sync visibility state safely
    if (visibleBrands.length === 0 && datasets.length > 0) {
        setVisibleBrands(datasets.map((ds: any) => ds.brand || ds.label).filter(Boolean));
    }

    const toggleBrand = (brand: string) => {
        setVisibleBrands(prev =>
            prev.includes(brand)
                ? prev.filter(b => b !== brand)
                : [...prev, brand]
        );
    };

    if (!groupedData.length) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 italic bg-white/5 rounded-3xl border border-dashed border-white/10">
                <Info className="mb-4 opacity-20" size={48} />
                No likeness data available for this segment.
            </div>
        );
    }

    return (
        <div className="w-full mt-4 flex flex-col gap-8">
            {/* BRAND TOGGLES - RESTORED */}
            <div className="flex flex-wrap gap-2 mb-2">
                {datasets.map((ds: any, idx: number) => {
                    const brand = ds.brand || ds.label;
                    const isVisible = visibleBrands.includes(brand);
                    const color = ds.is_benchmark ? '#94a3b8' : COLORS[idx % COLORS.length];

                    return (
                        <motion.button
                            key={`${brand}-${idx}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleBrand(brand)}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all duration-300
                                ${isVisible
                                    ? 'bg-brand-blue/10 dark:bg-white/10 border-brand-blue/20 dark:border-white/20 text-brand-blue dark:text-white shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                    : 'bg-transparent border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-500 grayscale opacity-40'}
                            `}
                        >
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                    backgroundColor: color,
                                    boxShadow: isVisible ? `0 0 10px ${color}` : 'none'
                                }}
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest">{ds.label || brand}</span>
                        </motion.button>
                    );
                })}
            </div>

            <div className="flex flex-col gap-8">
                {groupedData.map((group) => (
                    <AttributeGroup
                        key={group.name}
                        group={group}
                        datasets={datasets}
                        visibleBrands={visibleBrands}
                        isDark={isDark}
                        isFocusMode={isFocusMode}
                        presentationHeight={presentationHeight}
                    />
                ))}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em] opacity-60">
                <div className="w-8 h-px bg-slate-500" />
                <span>Computed averages on a 1-5 Likeness Scale</span>
            </div>
        </div>
    );
}

// PREMIUM GROUP SUB-COMPONENT
function AttributeGroup({ group, datasets, visibleBrands, isDark, isFocusMode, presentationHeight }: any) {
    const [isOpen, setIsOpen] = useState(true);

    // Calculate dynamic height based on metrics (80px per row + margins)
    const baseHeight = isFocusMode ? (presentationHeight ? presentationHeight / 2 : 500) : (group.metrics.length * 90 + 120);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`
                group rounded-[2.5rem] border transition-all duration-500
                ${isDark
                    ? 'bg-slate-900/40 backdrop-blur-3xl border-white/10 hover:border-white/20 shadow-2xl'
                    : 'bg-white/80 backdrop-blur-3xl border-slate-200 hover:border-slate-300 shadow-xl shadow-slate-200/50'}
            `}
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-8 py-6 flex items-center justify-between text-left"
            >
                <div className="flex items-center gap-5">
                    <div className={`
                        w-12 h-12 rounded-2xl flex items-center justify-center transition-colors
                        ${isDark ? 'bg-white/5 group-hover:bg-white/10' : 'bg-slate-50 group-hover:bg-slate-100'}
                    `}>
                        <div className="w-2 h-2 rounded-full bg-brand-blue shadow-[0_0_10px_#3b82f6]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.25em] text-brand-blue dark:text-white mb-1 group-hover:tracking-[0.3em] transition-all duration-500">
                            {group.name}
                        </h3>
                        <div className="flex items-center gap-3">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-60">
                                {group.metrics.length} Attributes Evaluated
                            </p>
                            <div className="w-1 h-1 rounded-full bg-slate-500 opacity-20" />
                            <p className="text-[10px] text-brand-blue font-bold uppercase tracking-widest opacity-80">
                                1.0 - 5.0 Rating Scale
                            </p>
                        </div>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isOpen ? 0 : -90, scale: isOpen ? 1 : 0.9 }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}
                >
                    <ChevronDown size={18} className={isDark ? 'text-white' : 'text-slate-900'} />
                </motion.div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        <div
                            className="px-4 pb-8 relative"
                            style={{ height: baseHeight }}
                        >
                            <div className="absolute inset-0 flex pointer-events-none opacity-20 px-8">
                                <div className={`flex-1 border-r ${isDark ? 'border-white/5' : 'border-slate-300'}`} />
                                <div className={`flex-1 border-l ${isDark ? 'border-white/5' : 'border-slate-300'}`} />
                            </div>

                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    layout="vertical"
                                    data={group.metrics}
                                    margin={{ top: 40, right: 60, left: 20, bottom: 20 }}
                                >
                                    <CartesianGrid horizontal={true} vertical={false} stroke={isDark ? "white" : "#94a3b8"} strokeOpacity={isDark ? 0.03 : 0.8} />

                                    <XAxis
                                        xAxisId="main"
                                        type="number"
                                        domain={[1, 5]}
                                        hide={false}
                                        orientation="top"
                                        stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(15, 23, 42, 0.9)"}
                                        fontSize={12}
                                        fontWeight={900}
                                        tickMargin={15}
                                        axisLine={false}
                                        tickLine={false}
                                        ticks={[1, 2, 3, 4, 5]}
                                    />

                                    <YAxis
                                        yAxisId={0}
                                        dataKey="id"
                                        type="category"
                                        orientation="left"
                                        width={240}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={(props: any) => {
                                            const { x, y, payload } = props;
                                            const row = group.metrics.find((r: any) => r.id === payload.value);
                                            const name = row?.name || '';
                                            const leftLbl = row?.left || '';

                                            return (
                                                <g transform={`translate(${x - 12},${y})`}>
                                                    <text
                                                        x={0}
                                                        y={-6}
                                                        textAnchor="end"
                                                        fill={isDark ? "#ffffff" : "#0f172a"}
                                                        fontSize={11}
                                                        fontWeight={900}
                                                        className="uppercase tracking-tighter italic"
                                                    >
                                                        {name}
                                                    </text>
                                                    <text
                                                        x={0}
                                                        y={14}
                                                        textAnchor="end"
                                                        fill="#f87171"
                                                        fontSize={10}
                                                        fontWeight={900}
                                                        className="uppercase tracking-widest opacity-70"
                                                    >
                                                        {leftLbl}
                                                    </text>
                                                </g>
                                            );
                                        }}
                                    />

                                    <YAxis
                                        yAxisId={1}
                                        dataKey="id"
                                        type="category"
                                        orientation="right"
                                        width={120}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={(props: any) => {
                                            const { x, y, payload } = props;
                                            const row = group.metrics.find((r: any) => r.id === payload.value);
                                            return (
                                                <text
                                                    x={x + 12}
                                                    y={y + 5}
                                                    textAnchor="start"
                                                    fill="#10b981"
                                                    fontSize={10}
                                                    fontWeight={900}
                                                    className="uppercase tracking-widest opacity-70"
                                                >
                                                    {row?.right || ''}
                                                </text>
                                            );
                                        }}
                                    />

                                    <Tooltip
                                        cursor={{ stroke: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', strokeWidth: 40 }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const first = payload[0].payload;
                                                return (
                                                    <div className="bg-[#0f172a]/95 backdrop-blur-xl border border-white/20 p-5 rounded-3xl shadow-2xl min-w-[220px]">
                                                        <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-4 pb-2 border-b border-white/5">
                                                            {first?.name || 'Evaluation'}
                                                        </div>
                                                        <div className="flex flex-col gap-3">
                                                            {payload.map((entry: any, i: number) => (
                                                                <div key={i} className="flex justify-between items-center gap-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                                                        <span className="text-xs font-bold text-slate-300 uppercase tracking-tight">
                                                                            {String(entry.name).split('(')[0].trim()}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-sm font-black text-white font-mono">
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
                                        xAxisId="main"
                                        x={3.0}
                                        stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(15, 23, 42, 0.4)"}
                                        strokeDasharray="8 4"
                                        strokeWidth={1.5}
                                    />

                                    {datasets.map((ds: any, idx: number) => {
                                        const brand = ds.brand || ds.label;
                                        if (!visibleBrands.includes(brand)) return null;

                                        const color = ds.is_benchmark ? '#94a3b8' : COLORS[idx % COLORS.length];

                                        return (
                                            <Line
                                                key={brand}
                                                xAxisId="main"
                                                yAxisId={0}
                                                type="monotone"
                                                dataKey={brand}
                                                name={ds.label || brand}
                                                stroke={color}
                                                strokeWidth={ds.is_benchmark ? 2 : 4}
                                                strokeDasharray={ds.is_benchmark ? "6 4" : "0"}
                                                dot={<CustomDot />}
                                                activeDot={{ r: 6, fill: color, stroke: '#fff', strokeWidth: 2 }}
                                                connectNulls={true}
                                                isAnimationActive={true}
                                                style={{
                                                    filter: ds.is_benchmark ? 'none' : `drop-shadow(0 0 8px ${color}44)`,
                                                    opacity: ds.is_benchmark ? 0.4 : 1
                                                }}
                                            />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
