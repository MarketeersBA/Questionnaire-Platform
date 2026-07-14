import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

const transformData = (raw: any) => {
    if (!raw || !raw.labels) return [];
    return raw.labels.map((label: string, index: number) => {
        const row: any = { subject: label };
        raw.datasets?.forEach((ds: any) => {
            row[ds.label] = ds.data[index];
        });
        return row;
    });
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export function FeatureRadar({ data, isFocusMode, presentationHeight }: { data: any, isFocusMode?: boolean, presentationHeight?: number }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const chartData = transformData(data);
    const datasets = data?.datasets || [];
    const domain = data?.domain || [0, 10];
    const isPercentage = data?.scale_type === 'percentage';

    if (!chartData.length) return <div className="text-slate-500 text-center py-20">No competitive data available</div>;

    return (
        <ResponsiveContainer width="100%" height={isFocusMode ? (presentationHeight || 700) : 450}>
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
                <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    {datasets.map((ds: any, idx: number) => (
                        <linearGradient key={`grad-${idx}`} id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={ds.is_benchmark ? '#475569' : COLORS[idx % COLORS.length]} stopOpacity={0.6} />
                            <stop offset="95%" stopColor={ds.is_benchmark ? '#1e293b' : COLORS[idx % COLORS.length]} stopOpacity={0.1} />
                        </linearGradient>
                    ))}
                </defs>

                <PolarGrid stroke={isDark ? '#1e293b' : '#94a3b8'} gridType="polygon" strokeDasharray="3 3" />

                <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: isDark ? '#94a3b8' : '#000000', fontSize: 10, fontWeight: 800 }}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                />

                <PolarRadiusAxis
                    angle={30}
                    domain={domain}
                    tick={{ fill: isDark ? '#475569' : '#000000', fontSize: 9, fontWeight: 700 }}
                    axisLine={false}
                    tickCount={6}
                />

                <Tooltip
                    cursor={{ stroke: '#3b82f6', strokeWidth: 1 }}
                    contentStyle={{
                        borderRadius: '24px',
                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        color: isDark ? '#e2e8f0' : '#1e293b',
                        boxShadow: isDark ? '0 20px 25px -5px rgba(0, 0, 0, 0.5)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        padding: '16px'
                    }}
                    itemStyle={{ fontSize: '12px', fontWeight: 700, padding: '2px 0' }}
                    labelStyle={{ marginBottom: '12px', color: isDark ? '#64748b' : '#000000', fontSize: '10px', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.1em' }}
                    formatter={(val: number) => isPercentage ? `${Math.round(val)}%` : `${val.toFixed(1)} pts`}
                />

                <Legend
                    verticalAlign="bottom"
                    align="center"
                    iconType="circle"
                    wrapperStyle={{
                        paddingTop: '30px',
                        color: isDark ? '#94a3b8' : '#000000',
                        fontWeight: 700,
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                    }}
                />

                {datasets.map((ds: any, idx: number) => {
                    const color = ds.is_benchmark ? '#475569' : COLORS[idx % COLORS.length];
                    const isFocus = ds.is_primary;

                    return (
                        <Radar
                            key={ds.label}
                            name={ds.label}
                            dataKey={ds.label}
                            stroke={color}
                            strokeWidth={isFocus ? 3 : 1.5}
                            strokeDasharray={ds.is_benchmark ? "4 4" : "0"}
                            fill={`url(#grad-${idx})`}
                            fillOpacity={isFocus ? 0.7 : 0.2}
                            style={{ filter: isFocus ? 'url(#glow)' : 'none' }}
                            animationBegin={idx * 150}
                            animationDuration={1200}
                        />
                    );
                })}
            </RadarChart>
        </ResponsiveContainer>
    );
}
