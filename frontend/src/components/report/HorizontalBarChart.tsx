import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { chartChrome } from '../../constants/brandPalette';
import { useTheme } from '../../context/ThemeContext';

const transformData = (raw: any) => {
    if (!raw) return [];

    // NEW pipeline shape: { labels: string[], datasets: [{label, data: number[]}] }
    if (raw.datasets && raw.labels) {
        return raw.labels.map((label: string, i: number) => {
            const row: any = { name: label };
            raw.datasets.forEach((ds: any) => {
                // Values are already percentages from ReportAggregator
                const val = ds.data[i];
                row[ds.label] = typeof val === 'number' && val <= 1 && val >= 0 ? val * 100 : val;
            });
            return row;
        });
    }

    return [];
};


export function HorizontalBarChart({ data }: { data: any }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const chrome = chartChrome(isDark);

    const chartData = transformData(data);
    const dataKeys = data?.datasets?.map((ds: any) => ds.label) || [];

    if (!chartData.length) {
        return <div className="text-ink-subtle text-center py-10 text-sm font-bold">No data</div>;
    }

    // Compact height for short brand lists (e.g. Product Preference with 2 bars).
    const height = Math.max(160, chartData.length * 40 + 48);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 100, bottom: 0 }}>
                <defs>
                    {/* Brand ramp: blue into red, left to right. */}
                    {dataKeys.map((key: string, idx: number) => (
                        <linearGradient key={key} id={`hbar-${idx}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={idx % 2 === 0 ? '#21A0FF' : '#E79D9E'} />
                            <stop offset="100%" stopColor={idx % 2 === 0 ? '#255E91' : '#CD393B'} />
                        </linearGradient>
                    ))}
                </defs>

                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical stroke={chrome.grid} />
                <XAxis
                    type="number"
                    tickFormatter={(val) => `${Math.round(val)}%`}
                    tick={{ fill: chrome.axis, fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    dataKey="name"
                    type="category"
                    /* Was #e2e8f0 — near-white, so category labels vanished on
                       the light canvas. */
                    tick={{ fill: chrome.label, fontSize: 12, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    width={96}
                />
                <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(37,94,145,0.06)' }}
                    contentStyle={{
                        borderRadius: '14px',
                        border: `1px solid ${chrome.tooltipBorder}`,
                        backgroundColor: chrome.tooltipBg,
                        color: chrome.label,
                        fontWeight: 700,
                    }}
                    formatter={(val: any) => `${Math.round(val)}%`}
                />
                <Legend
                    wrapperStyle={{
                        paddingTop: 8,
                        color: chrome.axis,
                        fontWeight: 700,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                    }}
                />
                {dataKeys.map((key: string, idx: number) => (
                    <Bar
                        key={key}
                        dataKey={key}
                        fill={`url(#hbar-${idx})`}
                        radius={[0, 8, 8, 0]}
                        barSize={22}
                    />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}
