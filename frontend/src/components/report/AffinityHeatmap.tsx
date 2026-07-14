import { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import {
    Users,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    ChevronDown
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface HeatmapDataPoint {
    field: string;
    segment: string;
    brand: string;
    aai: number;
    p_obs: number;
    p_exp: number;
    n_segment: number;
    is_target: boolean;
}

interface AffinityHeatmapProps {
    data: {
        heatmap: HeatmapDataPoint[];
        fields: string[];
        field_segments: Record<string, string[]>;
        brands: string[];
        core_audience: HeatmapDataPoint[];
    };
}

const getAaiColor = (aai: number, isDark: boolean) => {
    if (aai >= 120) {
        // High affinity (Emerald)
        const opacity = Math.min(0.1 + (aai - 100) / 100, 0.4);
        return isDark ? `rgba(16, 185, 129, ${opacity})` : `rgba(16, 185, 129, ${opacity})`;
    } else if (aai <= 80) {
        // Low affinity (Rose)
        const opacity = Math.min(0.1 + (100 - aai) / 100, 0.4);
        return isDark ? `rgba(244, 63, 94, ${opacity})` : `rgba(244, 63, 94, ${opacity})`;
    }
    // Neutral (Slate)
    return isDark ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.1)';
};

const getAaiTextColor = (aai: number) => {
    if (aai >= 120) return 'text-emerald-500';
    if (aai <= 80) return 'text-rose-500';
    return 'text-slate-400';
};

const AffinityCell = memo(({ point, isDark }: { point: HeatmapDataPoint, isDark: boolean }) => {
    const color = getAaiColor(point.aai, isDark);
    const textColor = getAaiTextColor(point.aai);

    return (
        <motion.div
            whileHover={{ scale: 1.05, zIndex: 10 }}
            className="group relative"
        >
            <div
                className="h-16 flex flex-col items-center justify-center rounded-xl p-2 transition-all duration-300 border border-transparent hover:border-white/20 hover:shadow-lg"
                style={{ backgroundColor: color }}
            >
                <span className={`text-xs font-black font-mono ${textColor}`}>
                    {point.aai.toFixed(0)}
                </span>
                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter truncate w-full text-center mt-1">
                    {point.segment}
                </span>

                {/* Tooltip on Hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 z-50">
                    <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl shadow-2xl min-w-[200px]">
                        <p className="text-[10px] font-black text-brand-blue uppercase tracking-widest mb-2">{point.segment}</p>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-400 font-bold">Brand Pop %</span>
                                <span className="text-white font-black">{point.p_obs}%</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-400 font-bold">Category Bench</span>
                                <span className="text-slate-500 font-black">{point.p_exp}%</span>
                            </div>
                            <div className="h-px bg-white/5 my-1" />
                            <div className="flex justify-between items-center text-[11px]">
                                <span className="text-emerald-400 font-bold uppercase italic">Affinity Index</span>
                                <span className="text-emerald-400 font-black">{point.aai.toFixed(1)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
});

AffinityCell.displayName = 'AffinityCell';

export function AffinityHeatmap({ data }: AffinityHeatmapProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [selectedBrand, setSelectedBrand] = useState(data.brands?.[0] || '');

    const filteredData = useMemo(() => {
        const fieldMap: Record<string, HeatmapDataPoint[]> = {};
        data.heatmap.forEach(p => {
            if (p.brand === selectedBrand) {
                if (!fieldMap[p.field]) fieldMap[p.field] = [];
                fieldMap[p.field].push(p);
            }
        });
        return fieldMap;
    }, [data.heatmap, selectedBrand]);

    return (
        <div className="space-y-8">
            {/* Header / Brand Selector */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50 dark:bg-white/[0.02] p-8 rounded-[40px] border border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-brand-blue/10 rounded-2xl">
                        <Users className="text-brand-blue w-6 h-6" />
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase italic tracking-tighter">
                            Audience DNA Matrix
                        </h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Segment Over/Under-Indexing across Category Benchmarks
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Focus Brand</span>
                    <div className="relative">
                        <select
                            value={selectedBrand}
                            onChange={(e) => setSelectedBrand(e.target.value)}
                            className="appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-8 py-3 pr-12 rounded-2xl text-xs font-black text-brand-blue uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all cursor-pointer shadow-sm"
                        >
                            {data.brands.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Heatmap Grid */}
            <div className="space-y-6">
                {data.fields.map(field => (
                    <div key={field} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                        {/* Field Label */}
                        <div className="lg:col-span-2 flex items-center gap-3 group">
                            <div className="w-1.5 h-10 rounded-full bg-slate-200 dark:bg-slate-800 group-hover:bg-brand-blue transition-colors" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{field.replace('_', ' ')}</span>
                                <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight group-hover:text-brand-blue transition-colors">Dimension Breakdown</span>
                            </div>
                        </div>

                        {/* Segments Row */}
                        <div className="lg:col-span-10">
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                                {filteredData[field]?.map((point, idx) => (
                                    <AffinityCell key={`${field}-${idx}`} point={point} isDark={isDark} />
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Synthesis Logic Footer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                <div className="p-6 rounded-[32px] bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-4">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                        <ArrowUpRight className="text-emerald-500 w-4 h-4" />
                    </div>
                    <div>
                        <h5 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 italic">Growth Catalyst</h5>
                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 leading-relaxed text-balance">
                            AAI {'>'} 120 indicate critical "win-zones" where the brand heavily over-indexes.
                        </p>
                    </div>
                </div>

                <div className="p-6 rounded-[32px] bg-slate-500/5 border border-slate-500/10 flex items-start gap-4">
                    <div className="p-2 bg-slate-500/10 rounded-xl">
                        <Minus className="text-slate-400 w-4 h-4" />
                    </div>
                    <div>
                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Category Norm</h5>
                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 leading-relaxed text-balance">
                            Values near 100 represent perfect alignment with the total category population.
                        </p>
                    </div>
                </div>

                <div className="p-6 rounded-[32px] bg-rose-500/5 border border-rose-500/10 flex items-start gap-4">
                    <div className="p-2 bg-rose-500/10 rounded-xl">
                        <ArrowDownRight className="text-rose-500 w-4 h-4" />
                    </div>
                    <div>
                        <h5 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1 italic">Penetration Gap</h5>
                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 leading-relaxed text-balance">
                            AAI {'<'} 80 suggest demographic silos where brand presence is significantly diluted.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

AffinityHeatmap.displayName = 'AffinityHeatmap';
