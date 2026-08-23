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

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Premium Tab Navigation */}
            {charts.length > 1 && (
                <div className="flex flex-wrap gap-2 p-1.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-line/80 dark:border-line/10 rounded-[24px] w-fit">
                    {charts.map((chart, idx) => (
                        <button
                            key={chart.chart_id || idx}
                            onClick={() => handleTabChange(idx)}
                            className={`px-6 py-2.5 rounded-[18px] text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${activeIndex === idx
                                ? 'bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] scale-105'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                                }`}
                        >
                            {getTabLabel(chart, idx)}
                        </button>
                    ))}
                </div>
            )}

            {/* Active Chart Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={charts[activeIndex]?.chart_id || activeIndex}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="hover:scale-[1.01] transition-all duration-500"
                >
                    <ChartRenderer chart={charts[activeIndex]} isFocusMode={isFocusMode} />
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
