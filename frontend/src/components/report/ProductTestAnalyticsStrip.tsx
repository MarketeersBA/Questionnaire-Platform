import { useEffect, useState } from 'react';
import { Beaker, Layers, Tag, Timer } from 'lucide-react';
import { analytics } from '../../services/api';

interface ProductTestMeta {
    enabled: boolean;
    registry_count?: number;
    summary?: {
        response_count: number;
        total_answers: number;
        by_timing: Record<string, number>;
        by_diagnostic_tag: Record<string, number>;
        by_module: Record<string, number>;
    };
}

interface ProductTestAnalyticsStripProps {
    surveyId: string;
}

export default function ProductTestAnalyticsStrip({ surveyId }: ProductTestAnalyticsStripProps) {
    const [meta, setMeta] = useState<ProductTestMeta | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const data = await analytics.getProductTestMeta(surveyId);
                if (mounted) setMeta(data);
            } catch {
                if (mounted) setMeta({ enabled: false });
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [surveyId]);

    if (loading || !meta?.enabled) return null;

    const summary = meta.summary;
    const timingKeys = Object.keys(summary?.by_timing || {});

    return (
        <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-violet-500/5 dark:from-indigo-950/30 dark:to-violet-950/20 p-6 space-y-4">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <Beaker size={18} />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
                        Product Test Data Layer
                    </p>
                    <p className="text-xs font-bold text-ink-muted mt-0.5">
                        Structured evaluations available for filtering and export (Phase 5 registry)
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3">
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        <Layers size={12} /> Registry
                    </div>
                    <div className="text-xl font-display font-black text-ink">
                        {meta.registry_count ?? 0}
                    </div>
                    <div className="text-[9px] font-bold text-slate-500">questions indexed</div>
                </div>
                <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3">
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        <Tag size={12} /> Answers
                    </div>
                    <div className="text-xl font-display font-black text-ink">
                        {summary?.total_answers ?? 0}
                    </div>
                    <div className="text-[9px] font-bold text-slate-500">flat evaluations</div>
                </div>
                <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3">
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        <Timer size={12} /> Phases
                    </div>
                    <div className="text-xl font-display font-black text-ink">
                        {timingKeys.length}
                    </div>
                    <div className="text-[9px] font-bold text-slate-500 truncate" title={timingKeys.join(', ')}>
                        {timingKeys.join(' · ') || '—'}
                    </div>
                </div>
                <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        Responses
                    </div>
                    <div className="text-xl font-display font-black text-ink">
                        {summary?.response_count ?? 0}
                    </div>
                    <div className="text-[9px] font-bold text-slate-500">with product_test block</div>
                </div>
            </div>
        </div>
    );
}
