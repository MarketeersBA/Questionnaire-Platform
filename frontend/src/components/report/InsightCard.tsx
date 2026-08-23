import { Lightbulb } from 'lucide-react';
import { motion } from 'framer-motion';

interface InsightCardProps {
    insight: string;
}

export function InsightCard({ insight }: InsightCardProps) {
    if (!insight) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-brand-primary/5 border-l-4 border-brand-primary p-6 rounded-r-2xl my-6"
        >
            <div className="flex items-start gap-4">
                <div className="bg-brand-primary/10 p-2 rounded-lg">
                    <Lightbulb className="h-6 w-6 text-brand-primary" />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-brand-primary uppercase tracking-wider mb-1">
                        AI Analytical Insight
                    </h4>
                    <p className="text-ink-muted leading-relaxed italic">
                        "{insight}"
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
