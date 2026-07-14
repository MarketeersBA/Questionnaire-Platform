import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Filter } from 'lucide-react';

interface FunnelChartProps {
    data: {
        unused: number;
        passed: number;
        failed: number;
        submitted: number;
        qualification_rate: number;
        completion_rate: number;
    } | null;
}

export default function FunnelChart({ data }: FunnelChartProps) {
    if (!data) return null;

    const chartData = [
        { name: 'Total Audience', value: (data.unused + data.passed + data.failed), fill: '#BEBEBE' },
        { name: 'Qualified (L1)', value: data.passed, fill: '#8ACAEC' },
        { name: 'Conversions (L2)', value: data.submitted, fill: '#08306B' },
    ];

    return (
        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-xl h-full flex flex-col text-left">
            <h3 className="text-lg font-display font-black mb-8 flex items-center gap-2 text-slate-900">
                <Filter className="w-5 h-5 text-brand-blue" />
                Conversion Funnel
            </h3>

            <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 60, top: 10, bottom: 10 }}>
                        <XAxis type="number" hide />
                        <YAxis
                            type="category"
                            dataKey="name"
                            stroke="#94a3b8"
                            fontSize={12}
                            width={100}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                        />
                        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={45}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                            <LabelList dataKey="value" position="right" fill="#64748b" fontSize={12} fontWeight="bold" />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 gap-6">
                <div className="text-center p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-2xl font-black text-brand-blue">{data.qualification_rate.toFixed(1)}%</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Qualification</p>
                </div>
                <div className="text-center p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-2xl font-black text-brand-cyan">{data.completion_rate.toFixed(1)}%</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Completion</p>
                </div>
            </div>
        </div>
    );
}
