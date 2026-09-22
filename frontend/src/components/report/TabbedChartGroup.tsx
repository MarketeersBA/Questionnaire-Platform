import React, { useState, useEffect } from 'react';
import { ChartRenderer } from './ChartRenderer';
import { motion, AnimatePresence } from 'framer-motion';
import { useReport } from '../../context/ReportContext';

interface TabbedChartGroupProps {
    groupName: string;
    charts: any[];
    isFocusMode?: boolean;
}

export const TabbedChartGroup: React.FC<TabbedChartGroupProps> = ({ groupName, charts, isFocusMode }) => {
    const { activeTabMap, setActiveTab } = useReport();
    const [activeIndex, setLocalActiveIndex] = useState(0);

    // Sync with global state if it exists for this group
    useEffect(() => {
        if (activeTabMap[groupName] !== undefined) {
            setLocalActiveIndex(activeTabMap[groupName]);
        }
    }, [activeTabMap, groupName]);

    const handleTabChange = (index: number) => {
        setLocalActiveIndex(index);
        setActiveTab(groupName, index);
    };

    if (!charts || charts.length === 0) return null;

    // Helper to get labels (brands for profiles, titles for others)
    const getTabLabel = (chart: any, index: number) => {
        if (groupName === 'Brand Profiles' && chart.title) {
            return chart.title;
        }
        return chart.title || `Visualization ${index + 1}`;
    };

    const safeIndex = Math.min(activeIndex, charts.length - 1);

    // Focus / immersion mode keeps the tabbed single-chart viewer.
    if (isFocusMode) {
        return (
            <div className="h-full min-h-0 flex flex-col gap-3 animate-fade-in">
                {charts.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 p-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-line/80 dark:border-line/10 rounded-[20px] w-fit shrink-0 max-w-full overflow-x-auto">
                        {charts.map((chart, idx) => (
                            <button
                                key={chart.chart_id || idx}
                                onClick={() => handleTabChange(idx)}
                                className={`px-5 py-2 rounded-[16px] text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-500 whitespace-nowrap ${safeIndex === idx
                                    ? 'bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                                    }`}
                            >
                                {getTabLabel(chart, idx)}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex-1 min-h-0 relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={charts[safeIndex]?.chart_id || safeIndex}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="absolute inset-0"
                        >
                            <ChartRenderer chart={charts[safeIndex]} isFocusMode={isFocusMode} />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        );
    }

    // Normal report view: every chart is its own hideable card inside the section.
    return (
        <div className="space-y-4 animate-fade-in">
            {charts.map((chart, idx) => (
                <div key={chart.chart_id || idx} className="hover:scale-[1.005] transition-transform duration-500">
                    <ChartRenderer chart={chart} isFocusMode={false} />
                </div>
            ))}
        </div>
    );
};
