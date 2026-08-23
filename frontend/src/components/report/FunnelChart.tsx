import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_SERIES } from '../../constants/brandPalette';
import { chartChrome } from '../../constants/brandPalette';
import { useTheme } from '../../context/ThemeContext';

const transformData = (raw: any) => {
    if (!raw || !raw.labels) return [];
    return raw.labels.map((label: string, index: number) => {
        const row: any = { name: label };
        (raw.datasets || []).forEach((ds: any) => {
            const val = ds.data[index];
            row[ds.label] = typeof val === 'number' && val <= 1 && val >= 0 ? val * 100 : val;
        });
        return row;
    });
};

const COLORS = CHART_SERIES;

export function FunnelChart({ data }: { data: any }) {
    const { theme } = useTheme();
    const chrome = chartChrome(theme === 'dark');
    const chartData = transformData(data);
    const dataKeys = data?.datasets?.map((ds: any) => ds.label) || [];

    if (!chartData.length) return <div className="text-slate-500 text-center py-20">No data</div>;

    return (
        <ResponsiveContainer width="100%" height={Math.max(350, chartData.length * 60 + 80)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, left: 140, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke={chrome.grid} />
                <XAxis type="number" tickFormatter={(val) => `${Math.round(val)}%`} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: chrome.label, fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    contentStyle={{ borderRadius: '14px', border: `1px solid ${chrome.tooltipBorder}`, backgroundColor: chrome.tooltipBg, color: chrome.label, fontWeight: 700 }}
                    formatter={(val: any) => `${Math.round(val)}%`}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', color: '#94a3b8', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                {dataKeys.map((key: string, idx: number) => (
                    <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} radius={[0, 8, 8, 0]} barSize={28} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}
