import { useState } from 'react';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';

import { getRecommendedActionDisplay } from './aidDeepAnalysisDisplay';

export interface AnalysisPoint {
    title: string;
    body: string;
    sentiment: "positive" | "negative" | "neutral" | string;
    recommended_action?: string;
}

interface AIDeepAnalysisProps {
    analysisPoints?: AnalysisPoint[];
}

export function AIDeepAnalysis({ analysisPoints }: AIDeepAnalysisProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    if (!analysisPoints || analysisPoints.length === 0) return null;

    const getSentimentColor = (sentiment: string) => {
        const s = sentiment.toLowerCase();
        if (s === 'positive') return 'bg-emerald-500 shadow-emerald-500/50';
        if (s === 'negative') return 'bg-rose-500 shadow-rose-500/50';
        return 'bg-amber-500 shadow-amber-500/50'; // neutral
    };

    return (
        <div className="mt-6 w-full">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`
                    flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300
                    ${isDark
                        ? 'bg-[#2A2B3D]/80 hover:bg-[#3A3B4D]/90 text-indigo-300 border border-indigo-500/30'
                        : 'bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                    }
                `}
            >
                <Activity size={16} className={isExpanded ? "text-indigo-400" : "text-indigo-500"} />
                <span>AI Deep Analysis</span>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className={`
                            mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
                        `}>
                            {analysisPoints.map((point, index) => {
                                const recommendedAction = getRecommendedActionDisplay(point.recommended_action);
                                return (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1, duration: 0.3 }}
                                    key={index}
                                    className={`
                                        p-5 rounded-xl border backdrop-blur-md relative overflow-hidden group
                                        ${isDark
                                            ? 'bg-gradient-to-b from-[#1E1F2E]/80 to-[#1A1A24]/90 border-gray-700/50 hover:border-indigo-500/50'
                                            : 'bg-white border-gray-200 hover:border-indigo-300 shadow-sm hover:shadow-md'
                                        }
                                        transition-all duration-300
                                    `}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center space-x-3">
                                            <span className={`
                                                flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                                                ${isDark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}
                                            `}>
                                                {index + 1}
                                            </span>
                                            <h4 className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                {point.title}
                                            </h4>
                                        </div>
                                        <div
                                            title={`Sentiment: ${point.sentiment}`}
                                            className={`w-2.5 h-2.5 rounded-full mt-1.5 shadow-sm ${getSentimentColor(point.sentiment)}`}
                                        />
                                    </div>
                                    <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {point.body}
                                    </p>
                                    {recommendedAction && (
                                        <div className="mt-2 text-xs font-semibold text-indigo-500 border-t border-indigo-100 dark:border-indigo-900 pt-2">
                                            Action: {recommendedAction}
                                        </div>
                                    )}

                                    {/* Accent corner hover glow */}
                                    <div className={`
                                        absolute -bottom-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500
                                        ${getSentimentColor(point.sentiment)}
                                    `} />
                                </motion.div>
                            );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
