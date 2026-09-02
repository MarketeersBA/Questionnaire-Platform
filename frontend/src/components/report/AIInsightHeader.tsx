import { Sparkles } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { motion } from 'framer-motion';

interface AIInsightHeaderProps {
    headline: string;
}

export function AIInsightHeader({ headline }: AIInsightHeaderProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    if (!headline) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`
                relative overflow-hidden rounded-xl p-3
                backdrop-blur-md border border-t-white/10 border-l-white/10
                flex items-start lg:items-center space-y-2 lg:space-y-0 lg:space-x-4
                shadow-lg
                ${isDark
                    ? 'bg-gradient-to-r from-[#1A1A24]/90 to-[#2A2B3D]/80 border-indigo-500/20 shadow-indigo-900/10'
                    : 'bg-gradient-to-r from-blue-50/90 to-indigo-50/80 border-indigo-200 shadow-indigo-100/50'}
            `}
        >
            {/* Subtle glow effect underneath */}
            <div className={`absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -ml-16 -mt-16 pointer-events-none`} />

            <div className={`
                flex-shrink-0 flex items-center justify-center p-2 rounded-lg 
                ${isDark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}
            `}>
                <Sparkles size={20} />
            </div>

            <div className="flex-1">
                <div className={`text-xs font-semibold tracking-wider uppercase mb-1 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                    AI Insight
                </div>
                <p className={`text-sm lg:text-base font-medium leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {headline}
                </p>
            </div>
        </motion.div>
    );
}
