import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface TimeSeriesChartProps {
    data: any[];
}

export default function TimeSeriesChart({ data }: TimeSeriesChartProps) {
    return (
        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-xl h-full flex flex-col text-left">
            <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-display font-black flex items-center gap-2 text-slate-900">
                    <TrendingUp className="w-5 h-5 text-brand-blue" />
                    Participation Trends
                </h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 shadow-inner">Last 30 Days</span>
            </div>

            <div className="flex-1 min-h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorSub" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8ACAEC" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#8ACAEC" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorPass" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#08306B" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#08306B" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                            dataKey="_id"
                            stroke="#94a3b8"
                            fontSize={10}
                            tickFormatter={(val) => val.split('-').slice(1).join('/')}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                        />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        <Area
                            type="monotone"
                            dataKey="submissions"
                            name="Submissions"
                            stroke="#8ACAEC"
                            fillOpacity={1}
                            fill="url(#colorSub)"
                            strokeWidth={4}
                            activeDot={{ r: 8, stroke: '#8ACAEC', strokeWidth: 3, fill: '#fff' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="passed"
                            name="Qualified"
                            stroke="#08306B"
                            fillOpacity={1}
                            fill="url(#colorPass)"
                            strokeWidth={4}
                            activeDot={{ r: 8, stroke: '#08306B', strokeWidth: 3, fill: '#fff' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
