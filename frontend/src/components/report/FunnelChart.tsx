import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

export function FunnelChart({ data }: { data: any }) {
    const chartData = transformData(data);
    const dataKeys = data?.datasets?.map((ds: any) => ds.label) || [];

    if (!chartData.length) return <div className="text-slate-500 text-center py-20">No data</div>;

    return (
        <ResponsiveContainer width="100%" height={Math.max(350, chartData.length * 60 + 80)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, left: 140, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#1e293b" />
                <XAxis type="number" tickFormatter={(val) => `${Math.round(val)}%`} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#e2e8f0', fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0f172a', color: '#e2e8f0' }}
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
