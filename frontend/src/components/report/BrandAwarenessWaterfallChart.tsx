import { useId } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LabelList,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { Info } from 'lucide-react';
import { motion } from 'framer-motion';

interface BrandAwarenessWaterfallChartProps {
    data: any;
    title?: string;
    brands?: string[];
    metadata?: any;
    isFocusMode?: boolean;
    presentationHeight?: number;
}

const transformData = (raw: any) => {
    if (!raw || !raw.labels) return [];
    return raw.labels.map((label: string, index: number) => {
        const row: any = { name: label };
        raw.datasets.forEach((ds: any) => {
            const val = ds.data[index];
            row[ds.label] = typeof val === 'number' && val <= 1 && val >= 0 ? val * 100 : val;
        });
        // Attach total if available in rows/objects or calculation
        if (raw.rows && raw.rows[index]) {
            row.total = (raw.rows[index].total_awareness_pct || 0) * 100;
        } else {
            row.total = Object.keys(row)
                .filter(k => k !== 'name' && k !== 'total')
                .reduce((sum, k) => sum + row[k], 0);
        }
        return row;
    });
};

export function BrandAwarenessWaterfallChart({
    data,
    metadata,
    isFocusMode,
    presentationHeight
}: BrandAwarenessWaterfallChartProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const chartIdPrefix = useId().replace(/:/g, '');
    const chartData = transformData(data);
    const dataKeys = data?.datasets?.map((ds: any) => ds.label) || [];

    // Phase 1: Dynamic Spacing Calculations
    const brandCount = chartData.length;
    const barSize = Math.max(24, Math.min(60, 600 / brandCount));
    const isDense = brandCount > 6;

    // Phase 3: High-Contrast Chroma Identity
    const stageColors: Record<string, string> = {
        "TOM": metadata?.series_colors?.["TOM"] || "#0B1F4D",           // Deepest Blue
        "Other_Unaided": metadata?.series_colors?.["Other_Unaided"] || "#1D4ED8", // Vibrant Cobalt
        "Aided": metadata?.series_colors?.["Aided"] || "#93C5FD",         // Soft Sky Blue
    };

    const fallbackColors = ['#0B1F4D', '#1D4ED8', '#93C5FD', '#60A5FA', '#3B82F6'];

    // Helper to generate a secondary color for gradients
    const getGradientColors = (color: string) => {
        // Simple logic to darken the color slightly for the gradient bottom
        return {
            top: color,
            bottom: color === "#93C5FD" ? "#60A5FA" : color === "#1D4ED8" ? "#1E3A8A" : "#05112E"
        };
    };

    if (!chartData.length) {
        return <div className={`text-center py-20 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No semantic data available</div>;
    }

    const renderCustomLabel = (props: any) => {
        const { x, y, width, value } = props;
        if (value < 3) return null; // Hide small labels

        return (
            <text
                x={x + width / 2}
                y={y + props.height / 2}
                fill="#ffffff"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isDense ? 10 : 12}
                fontWeight={900}
                className="pointer-events-none drop-shadow-md"
            >
                {Math.round(value)}%
            </text>
        );
    };

    const renderTotalLabel = (props: any) => {
        const { x, y, width, index } = props;
        const total = chartData[index]?.total;

        // Phase 2: Compact Vertical Pill Design
        const pillWidth = Math.min(width * 0.9, 45);
        const pillHeight = 32;
        const xPos = x + (width - pillWidth) / 2;
        const yPos = y - 42;

        return (
            <g className="pointer-events-none">
                {/* Glassmorphic Pill Background */}
                <rect
                    x={xPos}
                    y={yPos}
                    width={pillWidth}
                    height={pillHeight}
                    rx={pillHeight / 2}
                    fill={isDark ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.95)'}
                    stroke={isDark ? 'rgba(56,189,248,0.4)' : 'rgba(14,165,233,0.3)'}
                    strokeWidth={1}
                />

                {/* Total Percentage */}
                <text
                    x={x + width / 2}
                    y={yPos + 14}
                    textAnchor="middle"
                    fill={isDark ? '#38bdf8' : '#0284c7'}
                    fontSize={11}
                    fontWeight={900}
                    className="tracking-tighter"
                >
                    {Math.round(total)}%
                </text>

                {/* Micro Category Label */}
                <text
                    x={x + width / 2}
                    y={yPos + 24}
                    textAnchor="middle"
                    fill={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={6}
                    fontWeight={900}
                    className="uppercase tracking-[0.1em]"
                >
                    Total
                </text>

                {/* Connective Indicator Stem */}
                <rect
                    x={x + width / 2 - 0.5}
                    y={yPos + pillHeight}
                    width={1}
                    height={10}
                    fill={isDark ? 'rgba(56,189,248,0.3)' : 'rgba(14,165,233,0.2)'}
                />
            </g>
        );
    };

    return (
        <div className="w-full h-full flex flex-col">
            <ResponsiveContainer width="100%" height={isFocusMode ? (presentationHeight || 600) : 500}>
                <BarChart
                    data={chartData}
                    margin={{ top: 50, right: 30, left: 20, bottom: isDense ? 100 : 40 }}
                    barGap={0}
                >
                    <defs>
                        {dataKeys.map((key: string, idx: number) => {
                            const mainColor = stageColors[key] || fallbackColors[idx % fallbackColors.length];
                            const shades = getGradientColors(mainColor);
                            return (
                                <linearGradient
                                    key={`grad-${chartIdPrefix}-${key}`}
                                    id={`grad-${chartIdPrefix}-${key}`}
                                    x1="0" y1="0" x2="0" y2="1"
                                >
                                    <stop offset="0%" stopColor={shades.top} stopOpacity={1} />
                                    <stop offset="100%" stopColor={shades.bottom} stopOpacity={1} />
                                </linearGradient>
                            );
                        })}
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                    />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        tick={(props) => {
                            const { x, y, payload } = props;
                            return (
                                <g transform={`translate(${x},${y})`}>
                                    <text
                                        x={0}
                                        y={0}
                                        dy={isDense ? 10 : 20}
                                        textAnchor={isDense ? "end" : "middle"}
                                        fill={isDark ? '#e2e8f0' : '#475569'}
                                        fontSize={isDense ? 9 : 10}
                                        fontWeight={isDense ? 700 : 800}
                                        transform={isDense ? "rotate(-45)" : ""}
                                        className="uppercase tracking-widest pointer-events-none"
                                    >
                                        {payload.value}
                                    </text>
                                </g>
                            );
                        }}
                    />
                    <YAxis
                        hide
                        domain={[0, 115]} // Extra space for total label
                    />
                    <Tooltip
                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', radius: 10 }}
                        contentStyle={{
                            borderRadius: '20px',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            backgroundColor: isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.9)',
                            backdropFilter: 'blur(10px)',
                            padding: '12px 16px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                        }}
                        itemStyle={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                        labelStyle={{ fontSize: '12px', fontWeight: 900, marginBottom: '8px', color: isDark ? '#f8fafc' : '#0f172a' }}
                        formatter={(val: number) => [`${Math.round(val)}%`, '']}
                    />
                    <Legend
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ paddingTop: isDense ? '40px' : '30px' }}
                        content={(props) => {
                            const { payload } = props;
                            return (
                                <div className="flex flex-wrap justify-center gap-3 mt-6">
                                    {payload?.map((entry: any, index: number) => (
                                        <div
                                            key={`item-${index}`}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm transition-all duration-300 hover:scale-105 ${isDark
                                                ? 'bg-slate-900/50 border-slate-800'
                                                : 'bg-white border-slate-100'
                                                }`}
                                        >
                                            <div
                                                className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]"
                                                style={{
                                                    backgroundColor: entry.color,
                                                    boxShadow: `0 0 10px ${entry.color}40`
                                                }}
                                            />
                                            <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                {entry.value.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            );
                        }}
                    />
                    {dataKeys.map((key: string, idx: number) => (
                        <Bar
                            key={key}
                            dataKey={key}
                            stackId="a"
                            fill={`url(#grad-${chartIdPrefix}-${key})`}
                            barSize={barSize}
                            stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            strokeWidth={1}
                            radius={idx === dataKeys.length - 1 ? [10, 10, 0, 0] : [0, 0, 0, 0]}
                            isAnimationActive={true}
                            animationDuration={1500}
                            animationBegin={idx * 200}
                        >
                            <LabelList dataKey={key} content={renderCustomLabel} />
                            {idx === dataKeys.length - 1 && (
                                <LabelList dataKey={key} content={renderTotalLabel} />
                            )}
                        </Bar>
                    ))}
                </BarChart>
            </ResponsiveContainer>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className={`mt-4 mx-6 p-5 rounded-[2rem] border backdrop-blur-xl flex items-start gap-4 transition-all duration-500 hover:shadow-lg ${isDark
                    ? 'bg-slate-900/40 border-slate-800/50 hover:bg-slate-900/60'
                    : 'bg-white/60 border-slate-200/60 hover:bg-white/80'
                    }`}
            >
                <div className={`p-2.5 rounded-2xl ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                    <Info className={`w-4 h-4 transition-colors ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
                <div className="flex flex-col gap-1">
                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-blue-400/80' : 'text-blue-600/80'}`}>
                        Methodology: Waterfall Logic
                    </span>
                    <p className={`text-[11px] leading-relaxed font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        This visualization utilizes an <span className={isDark ? 'text-slate-200' : 'text-slate-900'}>Exclusive Awareness Model</span>.
                        Total Awareness is the aggregate of Top-of-Mind (TOM), Other Unaided, and Aided mentions.
                        To ensure accuracy, respondents are <span className="text-blue-500 font-bold underline decoration-blue-500/30 underline-offset-4">attributed only once</span> to their highest tier of conversion.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
