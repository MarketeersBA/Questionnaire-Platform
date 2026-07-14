import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

// grouped_bar format: { labels: ['Attr1', 'Attr2'], datasets: [{label: 'Brand', data: [4.2, 3.8]}] }
// Recharts expects: [{ name: 'Attr1', 'Brand A': 4.2, 'Brand B': 3.5 }]
const transformData = (raw: any) => {
    if (!raw || !raw.labels) return [];
    return raw.labels.map((label: string, index: number) => {
        const row: any = { name: label };
        (raw.datasets || []).forEach((ds: any) => {
            const val = ds.data[index];
            // Auto-detect: if all values are < 1, treat as proportions
            row[ds.label] = val;
        });
        return row;
    });
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function PreferenceChart({ data, isFocusMode, presentationHeight }: { data: any, isFocusMode?: boolean, presentationHeight?: number }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const chartData = transformData(data);
    const dataKeys = data?.datasets?.map((ds: any) => ds.label) || [];

    if (!chartData.length) return <div className="text-slate-500 text-center py-20">No data</div>;

    // Detect if values are small (scale data ~1-10) vs percentages (~0-100)
    const maxValue = Math.max(...chartData.flatMap((row: any) => dataKeys.map((k: string) => row[k] || 0)));
    const isPercent = maxValue > 10;
    const formatter = isPercent ? (val: number) => `${Math.round(val)}%` : (val: number) => val.toFixed(1);

    return (
        <ResponsiveContainer width="100%" height={isFocusMode ? (presentationHeight || 800) : Math.max(350, chartData.length * 30 + 100)}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#1e293b' : '#cbd5e1'} strokeOpacity={0.8} />
                <XAxis
                    dataKey="name"
                    tick={{ fill: isDark ? '#e2e8f0' : '#000000', fontSize: 11, fontWeight: 800 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={chartData.length > 6 ? -35 : 0}
                    textAnchor={chartData.length > 6 ? 'end' : 'middle'}
                    height={chartData.length > 6 ? 80 : 40}
                />
                <YAxis
                    tickFormatter={(val) => formatter(val)}
                    tick={{ fill: isDark ? '#94a3b8' : '#000000', fontSize: 12, fontWeight: 800 }}
                    axisLine={false}
                    tickLine={false}
                />
                <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
                    contentStyle={{
                        borderRadius: '16px',
                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        color: isDark ? '#e2e8f0' : '#1e293b',
                        boxShadow: isDark ? '0 10px 15px -3px rgba(0, 0, 0, 0.5)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(val: any) => formatter(Number(val))}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', color: isDark ? '#94a3b8' : '#000000', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                {dataKeys.map((key: string, idx: number) => (
                    <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} radius={[6, 6, 0, 0]} barSize={32} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}
