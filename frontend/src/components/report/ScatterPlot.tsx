import { useMemo, memo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend, ReferenceArea } from 'recharts';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { useReport } from '../../context/ReportContext';
import { Filter, ExternalLink } from 'lucide-react';
import { CHART_SERIES } from '../../constants/brandPalette';

// --- VISUAL TOKENS ---
const BRAND_COLORS = CHART_SERIES;

const SHAPES: any[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'wye'];

// --- INTERFACES ---
interface PointData {
    attribute: string;
    main_attribute?: string;
    sub_attribute?: string;
    x: number;
    y: number;
    brand: string;
    color?: string;
}

interface Dataset {
    brand: string;
    label?: string;
    color: string;
    shape: string;
    data: PointData[];
}

interface ScatterPlotProps {
    data: {
        datasets?: Array<any>;
        [key: string]: any;
    };
    brands?: string[];
    isFocusMode?: boolean;
    presentationHeight?: number;
}

// --- OPTIMIZED COMPONENTS ---
const CustomTooltip = memo(({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data: PointData = payload[0].payload;

    return (
        <div className="bg-white/95 dark:bg-slate-900/98 backdrop-blur-3xl border border-slate-200 dark:border-white/20 p-5 rounded-[24px] shadow-[0_24px_60px_rgba(0,0,0,0.1)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.6)] min-w-[200px] border-l-4" style={{ borderLeftColor: data.color }}>
            <div className="flex items-center gap-3 mb-4 border-b border-line/80 dark:border-line/10 pb-3">
                <p className="font-black text-ink uppercase tracking-[0.15em] text-[10px] opacity-80">{data.brand}</p>
            </div>
            <p className="font-black text-primary-soft uppercase tracking-widest text-xs mb-5 line-height-tight">{data.attribute}</p>
            <div className="grid grid-cols-1 gap-3">
                <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 px-3 py-2.5 rounded-xl border border-line/80 dark:border-line/10">
                    <span className="text-ink-muted text-[9px] font-black uppercase tracking-widest">Impact Factor</span>
                    <span className="text-emerald-500 dark:text-emerald-400 font-mono text-xs font-black">{(data.x || 0).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 px-3 py-2.5 rounded-xl border border-line/80 dark:border-line/10">
                    <span className="text-ink-muted text-[9px] font-black uppercase tracking-widest">Performance</span>
                    <span className="text-blue-500 dark:text-blue-400 font-mono text-xs font-black">{(data.y || 0).toFixed(1)}%</span>
                </div>
            </div>
        </div>
    );
});

CustomTooltip.displayName = 'CustomTooltip';

const QuadrantLayer = memo(() => (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none opacity-[0.05] dark:opacity-[0.035] select-none mix-blend-multiply dark:mix-blend-screen">
        <div className="border-r border-b border-slate-900/20 dark:border-white/30 flex items-start justify-end p-10"><span className="text-[55px] font-black uppercase transform rotate-[-3deg] tracking-tight">Optimization Zone</span></div>
        <div className="border-b border-slate-900/20 dark:border-white/30 flex items-start justify-start p-10"><span className="text-[55px] font-black uppercase transform rotate-[3deg] tracking-tight">Maintain Strengths</span></div>
        <div className="border-r border-slate-900/20 dark:border-white/30 flex items-end justify-end p-10"><span className="text-[55px] font-black uppercase transform rotate-[3deg] tracking-tight text-slate-400">Secondary Driver</span></div>
        <div className="flex items-end justify-start p-10"><span className="text-[55px] font-black uppercase transform rotate-[-2deg] tracking-tight text-rose-500">Core Liability</span></div>
    </div>
));
QuadrantLayer.displayName = 'QuadrantLayer';

const FilterBar = memo(({ mainAttributes, selectedFilter, onFilterChange, onNavigateToMain }: any) => {
    if (mainAttributes.length === 0) return null;

    return (
        <div className="relative z-20 mb-12 flex flex-col gap-6">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Filter size={14} className="text-primary-soft" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Filter by Dimension</span>
            </div>

            <div className="flex flex-wrap gap-2">
                <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onNavigateToMain}
                    className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 border relative overflow-hidden bg-primary/5 text-primary-soft border-primary/20 hover:bg-primary/10 flex items-center gap-3 group"
                >
                    <ExternalLink size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    Main Attributes
                </motion.button>

                {mainAttributes.map((attr: string) => (
                    <motion.button
                        key={attr}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onFilterChange(attr)}
                        className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 border relative overflow-hidden ${selectedFilter === attr
                            ? 'bg-primary text-white border-primary shadow-[0_20px_40px_rgba(59,130,246,0.25)]'
                            : 'bg-slate-50 dark:bg-white/5 text-slate-500 border-line/80 dark:border-line/10 hover:border-primary/30'
                            }`}
                    >
                        {selectedFilter === attr && (
                            <motion.div layoutId="activeFilter" className="absolute inset-0 bg-primary/80 backdrop-blur-md -z-10" />
                        )}
                        {attr}
                    </motion.button>
                ))}
            </div>
        </div>
    );
});
FilterBar.displayName = 'FilterBar';

// --- MAIN ENGINE ---
export function ScatterPlot({ data, isFocusMode, presentationHeight }: ScatterPlotProps) {
    const { theme } = useTheme();
    const { navigateToChart } = useReport();
    const isDark = theme === 'dark';
    const [selectedFilter, setSelectedFilter] = useState<string>('All');

    const axisColor = isDark ? '#475569' : '#000000';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.15)';
    const labelColor = isDark ? '#64748b' : '#000000';
    const rectFill = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)';
    const rectStroke = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';

    const { datasets, avgX, avgY, isEmpty, attributeGroups, mainAttributes } = useMemo(() => {
        const rawSets = data?.datasets || (Array.isArray(data) ? data : []);

        let totalX = 0, totalY = 0, validPoints = 0;
        const attrMap: Record<string, { x: number; yValues: number[] }> = {};
        const mainAttrSet = new Set<string>();

        const normalized: Dataset[] = rawSets.map((ds: any, idx: number) => {
            const color = ds.color || BRAND_COLORS[idx % BRAND_COLORS.length];
            const shape = ds.shape || SHAPES[idx % SHAPES.length];
            const brand = ds?.brand || ds?.label || `Brand ${idx + 1}`;

            const points: PointData[] = Array.isArray(ds?.data) ? ds.data.filter((pt: any) => {
                if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') return false;

                if (pt.main_attribute) mainAttrSet.add(pt.main_attribute);

                if (selectedFilter !== 'All' && pt.main_attribute && pt.main_attribute !== selectedFilter) {
                    return false;
                }
                return true;
            }).map((pt: any) => {
                totalX += pt.x;
                totalY += pt.y;
                validPoints++;

                if (pt.attribute) {
                    if (!attrMap[pt.attribute]) {
                        attrMap[pt.attribute] = { x: pt.x, yValues: [] };
                    }
                    attrMap[pt.attribute].yValues.push(pt.y);
                }

                return { ...pt, color, brand };
            }) : [];

            return { ...ds, brand, color, shape, data: points };
        }).filter((ds: Dataset) => ds.data.length > 0);

        const attributeGroups = Object.keys(attrMap).map(attr => ({
            attribute: attr,
            x: attrMap[attr].x,
            minY: Math.min(...attrMap[attr].yValues),
            maxY: Math.max(...attrMap[attr].yValues)
        }));

        return {
            datasets: normalized,
            avgX: validPoints > 0 ? totalX / validPoints : 50,
            avgY: validPoints > 0 ? totalY / validPoints : 50,
            isEmpty: normalized.length === 0 && selectedFilter === 'All',
            attributeGroups,
            mainAttributes: Array.from(mainAttrSet).sort()
        };
    }, [data, selectedFilter]);

    if (isEmpty) {
        return (
            <div className="h-[600px] w-full flex items-center justify-center border border-white/5 rounded-[60px] bg-white/[0.01] backdrop-blur-2xl">
                <div className="flex flex-col items-center gap-6 text-slate-500">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="w-12 h-12 border-b-2 border-white/20 rounded-full" />
                    <span className="text-[11px] font-black uppercase tracking-[0.4em] opacity-40">Matrix Synchronized: Data Pipeline Empty</span>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.99, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full p-12 bg-surface/50 border border-line/80 dark:border-line/10 rounded-[60px] overflow-hidden backdrop-blur-3xl shadow-[0_40px_80px_rgba(0,0,0,0.04)] dark:shadow-[0_60px_120px_-30px_rgba(0,0,0,0.6)]"
        >
            <FilterBar
                mainAttributes={mainAttributes}
                selectedFilter={selectedFilter}
                onFilterChange={setSelectedFilter}
                onNavigateToMain={() => navigateToChart('overall_scatter')}
            />

            <QuadrantLayer />

            <div className="relative z-10">
                <ResponsiveContainer width="100%" height={isFocusMode ? (presentationHeight || 750) : 600}>
                    <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="1 10" stroke={gridColor} vertical={false} />

                        <XAxis
                            type="number"
                            dataKey="x"
                            name="Impact"
                            tick={{ fill: axisColor, fontSize: 10, fontWeight: 900 }}
                            axisLine={false}
                            tickLine={false}
                            domain={[0, 100]}
                            label={{ value: 'DRIVER IMPACT (CORRELATION TO BRAND EQUITY %)', position: 'bottom', offset: 25, fill: labelColor, fontSize: 9, fontStyle: 'italic', fontWeight: 900, letterSpacing: '0.25em' }}
                        />

                        <YAxis
                            type="number"
                            dataKey="y"
                            name="Performance"
                            tick={{ fill: axisColor, fontSize: 10, fontWeight: 900 }}
                            axisLine={false}
                            tickLine={false}
                            domain={[0, 100]}
                            label={{ value: 'PERFORMANCE SCORE (T2B %)', angle: -90, position: 'left', offset: 0, fill: labelColor, fontSize: 9, fontStyle: 'italic', fontWeight: 900, letterSpacing: '0.25em', textAnchor: 'middle' }}
                        />

                        <Tooltip cursor={{ strokeDasharray: '4 4', stroke: 'rgba(255,255,255,0.2)' }} content={<CustomTooltip />} />
                        <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '40px' }} iconType="circle" />

                        {/* Benchmark Intersects */}
                        <ReferenceLine x={avgX} stroke="rgba(96, 165, 250, 0.25)" strokeDasharray="10 5" strokeWidth={1} />
                        <ReferenceLine y={avgY} stroke="rgba(96, 165, 250, 0.25)" strokeDasharray="10 5" strokeWidth={1} />

                        {/* Attribute Bounding Boxes */}
                        {attributeGroups.map((group) => (
                            <ReferenceArea
                                key={`rect-${group.attribute}`}
                                x1={Math.max(0, group.x - 2.5)}
                                x2={Math.min(100, group.x + 2.5)}
                                y1={Math.max(0, group.minY - 5)}
                                y2={Math.min(100, group.maxY + 5)}
                                shape={(props: any): any => {
                                    const { x, y, width, height } = props;
                                    if (x == null || y == null || width == null || height == null) return <g />;
                                    return (
                                        <g>
                                            <rect
                                                x={x}
                                                y={y}
                                                width={width}
                                                height={height}
                                                rx={18}
                                                fill={rectFill}
                                                stroke={rectStroke}
                                                strokeDasharray="4 4"
                                            />
                                            {attributeGroups.length <= 8 && (
                                                <text
                                                    x={x + width / 2}
                                                    y={y - 12}
                                                    textAnchor="middle"
                                                    fill={labelColor}
                                                    fontSize={10}
                                                    fontWeight={900}
                                                    className="uppercase opacity-80"
                                                    style={{ letterSpacing: '0.15em' }}
                                                >
                                                    {group.attribute}
                                                </text>
                                            )}
                                        </g>
                                    );
                                }}
                            />
                        ))}

                        {datasets.map((ds) => (
                            <Scatter
                                key={ds.brand}
                                name={ds.brand}
                                data={ds.data}
                                fill={ds.color}
                                shape={ds.shape as any}
                            >
                                {ds.data.map((_, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={ds.color}
                                        className="transition-all duration-500 hover:brightness-150"
                                        style={{
                                            filter: `drop-shadow(0 0 12px ${ds.color}cc) drop-shadow(0 0 25px ${ds.color}40)`,
                                            cursor: 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                    />
                                ))}
                            </Scatter>
                        ))}
                    </ScatterChart>
                </ResponsiveContainer>
            </div>

            {/* Matrix Data Logic Footer */}
            <div className="mt-12 flex flex-wrap justify-between items-center bg-slate-50 dark:bg-white/[0.02] border border-line/80 dark:border-line/10 p-8 rounded-[40px] relative z-10">
                <div className="flex gap-14">
                    <div className="flex flex-col gap-2">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Statistical Method</span>
                        <span className="text-[12px] font-bold text-slate-800 dark:text-slate-200">Pearson Hierarchical Correlation</span>
                    </div>
                    <div className="flex flex-col gap-2 border-l border-line/80 dark:border-line/10 pl-14">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Reference Frame</span>
                        <span className="text-[12px] font-bold text-slate-800 dark:text-slate-200">Cross-Brand T2B Mean Benchmarks</span>
                    </div>
                </div>

                <div className="flex items-center gap-5 px-6 py-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl shadow-inner backdrop-blur-md">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                    <span className="text-[11px] font-black text-blue-400 uppercase tracking-[0.2em]">
                        Intersection: {avgX.toFixed(1)}% Impact / {avgY.toFixed(1)}% Performance
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

ScatterPlot.displayName = 'ScatterPlot';
