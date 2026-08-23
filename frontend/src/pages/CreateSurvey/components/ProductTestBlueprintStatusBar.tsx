import { Loader2 } from 'lucide-react';
import { ProductTestBlueprintSnapshot } from '../../../utils/architectStepDiagnostics';

interface ProductTestBlueprintStatusBarProps {
    snapshot: ProductTestBlueprintSnapshot;
    isGenerating?: boolean;
}

export function ProductTestBlueprintStatusBar({ snapshot, isGenerating }: ProductTestBlueprintStatusBarProps) {
    const items = [
        { label: 'L1 Questions', value: snapshot.l1QuestionCount },
        { label: 'Phases', value: snapshot.phaseCount },
        { label: 'Sections', value: snapshot.sectionCount },
        { label: 'Questions', value: snapshot.questionCount },
        { label: 'Attributes', value: snapshot.selectedAttributeCount },
        {
            label: 'Package Test',
            value: snapshot.packageTestEnabled
                ? (snapshot.packageAttributeCount > 0 ? `On (${snapshot.packageAttributeCount})` : 'On')
                : 'Off',
            highlight: snapshot.packageTestEnabled,
        },
        {
            label: 'Packaging Heatmap',
            value: snapshot.packagingHeatmapEnabled
                ? (snapshot.packagingHeatmapQuestionCount > 0
                    ? `On (${snapshot.packagingHeatmapQuestionCount} Qs)`
                    : 'On')
                : 'Off',
            highlight: snapshot.packagingHeatmapEnabled,
        },
    ];

    return (
        <div className="glass-card bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] rounded-[2rem] px-6 py-4 border border-emerald-500/15 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-700 dark:text-emerald-400">
                    Product Test Blueprint Status
                </p>
                {isGenerating && (
                    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-primary-soft">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Syncing…
                    </span>
                )}
            </div>
            <div className="flex flex-wrap gap-2 md:gap-3">
                {items.map(item => (
                    <div
                        key={item.label}
                        className={`px-3 py-2 rounded-xl border text-center min-w-[5.5rem] ${
                            item.highlight
                                ? 'bg-indigo-500/10 border-indigo-500/20'
                                : 'bg-white/70 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-700/80'
                        }`}
                    >
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{item.label}</p>
                        <p className={`text-sm font-display font-black ${
                            item.highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-ink'
                        }`}>
                            {item.value}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
