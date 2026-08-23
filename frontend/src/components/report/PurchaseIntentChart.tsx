import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { CHART_SERIES } from '../../constants/brandPalette';

const transformData = (raw: any) => {
    if (!raw || !raw.labels) return [];
    return raw.labels.map((label: string, index: number) => {
        const row: any = { name: label };
        raw.datasets.forEach((ds: any) => {
            const val = ds.data[index];
            row[ds.label] = typeof val === 'number' && val <= 1 && val >= 0 ? val * 100 : val;
        });
        return row;
    });
};

const COLORS = CHART_SERIES;

type PurchaseIntentChartProps = {
    data: any;
    metadata?: any;
    isFocusMode?: boolean;
    presentationHeight?: number;
};

export function PurchaseIntentChart({ data, metadata, isFocusMode, presentationHeight }: PurchaseIntentChartProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const chartData = transformData(data);
    const dataKeys = data?.datasets?.map((ds: any) => ds.label) || [];
    const thresholdRaw = metadata?.label_threshold_pct;
    const thresholdRatio =
        typeof thresholdRaw === 'number' && Number.isFinite(thresholdRaw) && thresholdRaw >= 0
            ? thresholdRaw
            : 0.03;
    const thresholdPct = thresholdRatio <= 1 ? thresholdRatio * 100 : thresholdRatio;
    const seriesColors = metadata?.series_colors && typeof metadata.series_colors === 'object'
        ? metadata.series_colors
        : null;

    const renderLabel = (props: any) => {
        const value = typeof props?.value === 'number' ? props.value : Number(props?.value);
        if (!Number.isFinite(value) || value < thresholdPct) return null;
        return (
            <text
                x={props.x + props.width / 2}
                y={props.y + props.height / 2}
                fill={isDark ? '#e2e8f0' : '#0f172a'}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={800}
            >
                {`${Math.round(value)}%`}
            </text>
        );
    };

    if (!chartData.length) return <div className={`text-center py-20 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No semantic data available</div>;

    return (
        <ResponsiveContainer width="100%" height={isFocusMode ? (presentationHeight || 600) : Math.max(300, chartData.length * 50 + 80)}>
            <BarChart layout="vertical" data={chartData} margin={{ top: 20, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? '#1e293b' : '#e2e8f0'} />
                <XAxis type="number" tickFormatter={(val) => `${Math.round(val)}%`} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <YAxis type="category" dataKey="name" tick={{ fill: isDark ? '#e2e8f0' : '#1e293b', fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}
                    contentStyle={{ borderRadius: '16px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`, backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#e2e8f0' : '#1e293b' }}
                    formatter={(val: number) => `${Math.round(val)}%`}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                {dataKeys.map((key: string, idx: number) => (
                    <Bar
                        key={key}
                        dataKey={key}
                        stackId="a"
                        fill={seriesColors?.[key] || COLORS[idx % COLORS.length]}
                        radius={dataKeys.length === 1 ? [0, 8, 8, 0] : 0}
                    >
                        <LabelList dataKey={key} content={renderLabel} />
                    </Bar>
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}
