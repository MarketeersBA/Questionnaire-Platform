import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

const COLORS = [
    '#3b82f6', // Brand Blue
    '#10b981', // Emerald Green
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
];

// Recharts LineChart expects Data in the format:
// [ { name: "Total Awareness", "Brand A": 80.5, "Brand B": 60.0 }, ... ]
const transformData = (raw: any) => {
    if (!raw || !raw.labels) return [];
    return raw.labels.map((label: string, index: number) => {
        const row: any = { name: label };
        (raw.datasets || []).forEach((ds: any) => {
            row[ds.label] = Number(ds.data[index]) * 100;
        });
        return row;
    });
};

export function PurchaseFunnelLineChart({ data, isFocusMode, presentationHeight }: { data: any, isFocusMode?: boolean, presentationHeight?: number }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const chartData = transformData(data);
    const allBrands = data?.datasets?.map((ds: any) => ds.label) || [];

    // Phase 4: Interactive UI State Management (Default to All visible)
    const [visibleBrands, setVisibleBrands] = useState<string[]>(allBrands);

    if (!chartData.length) return <div className="text-slate-500 text-center py-20">No funnel data available</div>;

    const formatter = (val: number) => `${val.toFixed(1)}%`;

    const handleLegendClick = (dataKey: string) => {
        setVisibleBrands((prev) => {
            if (prev.includes(dataKey)) {
                return prev.filter(b => b !== dataKey); // Hide
            } else {
                return [...prev, dataKey]; // Show
            }
        });
    };

    const toggleAll = () => {
        if (visibleBrands.length === allBrands.length) {
            // If all are visible, hide them all
            setVisibleBrands([]);
        } else {
            // Otherwise, show all
            setVisibleBrands(allBrands);
        }
    };

    // Custom Interactive Legend Component
    const renderLegend = () => {
        const sortedBrands = [...allBrands].sort((a, b) => a.localeCompare(b));

        return (
            <div className={`flex flex-col items-center mt-2 w-full px-2 ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                <div className="flex flex-wrap justify-center gap-2 w-full">
                    <button
                        onClick={toggleAll}
                        className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all duration-300 border ${visibleBrands.length === allBrands.length
                            ? (isDark ? 'bg-slate-800 border-slate-700 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'bg-slate-200 border-slate-300 text-black')
                            : (isDark ? 'bg-transparent border-slate-700 hover:bg-slate-800' : 'bg-transparent border-slate-200 hover:bg-slate-100')
                            }`}
                    >
                        Toggle All
                    </button>

                    {sortedBrands.map((brand: string) => {
                        const isVisible = visibleBrands.includes(brand);
                        // Find original index for color consistency
                        const originalIdx = allBrands.indexOf(brand);
                        const color = COLORS[originalIdx % COLORS.length];

                        return (
                            <button
                                key={brand}
                                onClick={() => handleLegendClick(brand)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-300 border backdrop-blur-sm ${isVisible
                                    ? (isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10')
                                    : 'opacity-40 grayscale hover:opacity-70'
                                    }`}
                            >
                                <div
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    {brand}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full flex flex-col pt-4">
            <ResponsiveContainer width="100%" height={isFocusMode ? ((presentationHeight || 800) - 240) : 400}>
                <LineChart data={chartData} margin={{ top: 20, right: 40, left: 20, bottom: 20 }}>
                    {/* Horizontal grid lines for cleaner design */}
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#1e293b' : '#cbd5e1'} strokeOpacity={0.8} />
                    <XAxis
                        dataKey="name"
                        tick={{ fill: isDark ? '#e2e8f0' : '#000000', fontSize: 12, fontWeight: 800 }}
                        axisLine={{ stroke: isDark ? '#334155' : '#94a3b8', strokeWidth: 2 }}
                        tickLine={false}
                        interval={0}
                        padding={{ left: 30, right: 30 }}
                    />
                    <YAxis
                        domain={[0, 100]} // Constrain Y-axis from 0 to 100%
                        tickFormatter={formatter}
                        tick={{ fill: isDark ? '#94a3b8' : '#000000', fontSize: 12, fontWeight: 800 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        cursor={{ stroke: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', strokeWidth: 2, strokeDasharray: '5 5' }}
                        contentStyle={{
                            borderRadius: '20px',
                            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
                            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(8px)',
                            color: isDark ? '#f1f5f9' : '#0f172a',
                            boxShadow: isDark ? '0 20px 50px -12px rgba(0, 0, 0, 0.5)' : '0 20px 50px -12px rgba(0, 0, 0, 0.1)',
                            padding: '12px 16px'
                        }}
                        itemStyle={{ fontSize: 11, fontWeight: '700', padding: '1px 0' }}
                        labelStyle={{ marginBottom: '6px', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', color: isDark ? '#64748b' : '#94a3b8' }}
                        formatter={(val: any, name: string) => [`${Number(val).toFixed(2)}%`, name]}
                    />

                    {allBrands.map((brand: string, idx: number) => {
                        // Skip rendering the line if hidden via Legend
                        if (!visibleBrands.includes(brand)) return null;

                        return (
                            <Line
                                key={brand}
                                type="monotone" // "Snake" style smooth curvature
                                dataKey={brand}
                                stroke={COLORS[idx % COLORS.length]}
                                strokeWidth={4}
                                dot={{ fill: COLORS[idx % COLORS.length], stroke: isDark ? '#0f172a' : '#ffffff', r: 6, strokeWidth: 2 }}
                                activeDot={{ fill: COLORS[idx % COLORS.length], stroke: '#ffffff', strokeWidth: 3, r: 8 }}
                                isAnimationActive={true}
                                animationDuration={1500}
                                animationEasing="ease-in-out"
                            />
                        );
                    })}
                </LineChart>
            </ResponsiveContainer>

            {/* Legend Area - Auto-height with scrolling as fallback */}
            <div className={`mt-8 shrink-0 overflow-y-auto custom-scrollbar scrollbar-slim px-4 pb-4`} style={{ maxHeight: isFocusMode ? '200px' : 'none' }}>
                {renderLegend()}
            </div>
        </div>
    );
}
