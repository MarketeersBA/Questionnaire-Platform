import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { rankColor } from '../../constants/brandPalette';

/* ─── Overall markers to skip ─── */
const OVERALL_MARKERS = ['general', 'overall', 'likeness', 'total', 'global', 'essence', 'overall likeness'];
const isOverall = (name: string) => OVERALL_MARKERS.some(m => name.toLowerCase().includes(m));

/* ─── Custom Tooltip ─── */
const DriverTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-surface border border-line/80 dark:border-line/10 px-5 py-4 rounded-2xl shadow-2xl min-w-[180px]">
            <p className="font-black text-ink text-xs uppercase tracking-widest mb-3">{d.name}</p>
            <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[10px] font-bold uppercase">Impact Factor</span>
                <span className="text-primary-soft font-mono text-xs font-black">{Math.round(d.impact)}%</span>
            </div>
        </div>
    );
};

export function TornadoChart({ data: chartDataInput }: { data: any }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    /**
     * Ranked MAIN attributes only.
     *
     * The backend now rolls sub-attributes up into their parent and sends
     * `level: 'main'`, so each point already is a main attribute. The
     * label-parsing fallback below only exists for reports generated before
     * that change, where the label arrives as the legacy `"(Main - Sub)"`
     * string.
     */
    const chartData = useMemo(() => {
        if (!chartDataInput?.datasets) return [];

        const isPreRolled = chartDataInput.level === 'main';
        const attrMap = new Map<string, number>();

        chartDataInput.datasets.forEach((ds: any) => {
            if (!Array.isArray(ds.data)) return;
            ds.data.forEach((pt: any) => {
                if (pt?.x === undefined) return;

                let displayName = String(pt.main_attribute || pt.attribute || '').trim();
                if (!displayName) return;

                if (!isPreRolled) {
                    const mainAttr = String(pt.main_attribute || '').trim();
                    const subAttr = String(pt.sub_attribute || '').trim();

                    if (mainAttr && subAttr) {
                        // A genuine sub-attribute belongs in the drill-down, not here.
                        if (mainAttr.toLowerCase() !== subAttr.toLowerCase()) return;
                        displayName = mainAttr;
                    } else if (displayName.startsWith('(') && displayName.endsWith(')')) {
                        // Legacy "(Main - Sub)" label. Split on the LAST separator so
                        // attribute names that themselves contain " - " still resolve.
                        const inner = displayName.slice(1, -1);
                        const idx = inner.lastIndexOf(' - ');
                        if (idx > 0) {
                            const main = inner.slice(0, idx).trim();
                            const sub = inner.slice(idx + 3).trim();
                            if (main.toLowerCase() !== sub.toLowerCase()) return;
                            displayName = main;
                        } else {
                            displayName = inner.trim();
                        }
                    }
                }

                if (!displayName || isOverall(displayName)) return;

                // Keep the strongest observed impact for the attribute.
                const current = attrMap.get(displayName) ?? -Infinity;
                if (pt.x > current) attrMap.set(displayName, pt.x);
            });
        });

        return Array.from(attrMap.entries())
            .map(([name, impact]) => ({ name, impact }))
            .sort((a, b) => b.impact - a.impact);
    }, [chartDataInput]);

    if (!chartData.length) return <div className="text-slate-500 text-center py-20">No data available</div>;

    const angled = chartData.length > 6;
    const barSize = Math.max(14, Math.min(36, Math.floor(520 / chartData.length)));

    return (
        <div className="relative w-full p-4 bg-transparent h-full">
            <ResponsiveContainer width="100%" height={380}>
                <BarChart
                    data={chartData}
                    margin={{ top: 12, right: 16, left: 8, bottom: angled ? 72 : 36 }}
                >
                    <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}
                    />
                    <XAxis
                        dataKey="name"
                        interval={0}
                        angle={angled ? -35 : 0}
                        textAnchor={angled ? 'end' : 'middle'}
                        height={angled ? 80 : 40}
                        tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        type="number"
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                        label={{
                            value: 'IMPACT %',
                            angle: -90,
                            position: 'insideLeft',
                            offset: 4,
                            fill: isDark ? '#475569' : '#64748b',
                            fontSize: 9,
                            fontStyle: 'italic',
                            fontWeight: 900,
                            letterSpacing: '0.15em',
                        }}
                    />
                    <Tooltip
                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
                        content={<DriverTooltip />}
                    />
                    <Bar dataKey="impact" radius={[8, 8, 0, 0]} barSize={barSize}>
                        {chartData.map((_, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={rankColor(index, chartData.length, isDark)}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
