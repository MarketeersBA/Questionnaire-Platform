import React from 'react';
import { PreferenceChart } from './PreferenceChart';
import { PurchaseIntentChart } from './PurchaseIntentChart';
import { FeatureRadar } from './FeatureRadar';
import { ImportanceMatrix } from './ImportanceMatrix';
import { NpsGauge } from './NpsGauge';
import { OpenEndCloud } from './OpenEndCloud';
import { DataTable } from './DataTable';
import { ScorecardGrid } from './ScorecardGrid';
import { HorizontalBarChart } from './HorizontalBarChart';
import { FunnelChart } from './FunnelChart';
import { ScatterPlot } from './ScatterPlot';
import { CriteriaTableChart } from './CriteriaTableChart';
import { AttributeProfileChart } from './AttributeProfileChart';
import { LikenessProfileChart } from './LikenessProfileChart';
import { PurchaseFunnelRatioCardsChart } from './PurchaseFunnelRatioCardsChart';
import { PurchaseFunnelLineChart } from './PurchaseFunnelLineChart';
import { BrandAwarenessWaterfallChart } from './BrandAwarenessWaterfallChart';
import { ReferenceTableChart } from './ReferenceTableChart';
import { VerbatimAnalysisChart } from './VerbatimAnalysisChart';
import { SigmaIntentChart } from './SigmaIntentChart';
import { BrandComparisonChart } from './BrandComparisonChart';
import { PositioningMatrixChart } from './PositioningMatrixChart';
import { AffinityHeatmap } from './AffinityHeatmap';
import { AIInsightHeader } from './AIInsightHeader';
import { AIDeepAnalysis } from './AIDeepAnalysis';
import { Layout } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import type { ExportChartOptions } from '../../export/types';
import { ChartCsvExportButton } from './ChartCsvExportButton';
import { AsyncBoundary } from '../common/AsyncBoundary';

interface ChartRendererProps {
    chart: any;
    isFocusMode?: boolean;
    exportMode?: boolean;
    exportOptions?: ExportChartOptions;
}

export function ChartRenderer({
    chart,
    isFocusMode,
    exportMode = false,
    exportOptions,
}: ChartRendererProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const headerRef = React.useRef<HTMLDivElement>(null);
    const footerRef = React.useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [chartHeight, setChartHeight] = React.useState(500);

    const resolvedExportOptions = React.useMemo<ExportChartOptions>(() => ({
        width: exportOptions?.width ?? 1747,
        height: exportOptions?.height ?? 720,
        includeTitle: exportOptions?.includeTitle ?? false,
        includeAiHeadline: exportOptions?.includeAiHeadline ?? false,
        includeFootnotes: exportOptions?.includeFootnotes ?? false,
        includeAiDeepAnalysis: exportOptions?.includeAiDeepAnalysis ?? false,
    }), [exportOptions]);

    const presentationHeight = exportMode ? resolvedExportOptions.height : chartHeight;

    React.useLayoutEffect(() => {
        if (!isFocusMode || exportMode) return;

        const updateHeight = () => {
            if (containerRef.current) {
                const totalH = window.innerHeight - 240; // Total safe viewport
                const headerH = headerRef.current?.offsetHeight || 0;
                const footerH = footerRef.current?.offsetHeight || 0;

                // Secure calculation: Viewport - (Static Metadata + Padding Safeties)
                const safeH = Math.max(300, Math.min(800, totalH - headerH - footerH - 80));
                setChartHeight(safeH);
            }
        };

        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, [exportMode, isFocusMode, chart]);

    if (!chart) return null;

    const CHART_MAP: Record<string, React.FC<any>> = {
        criteria_table: CriteriaTableChart,
        grouped_bar: PreferenceChart,
        stacked_bar: PurchaseIntentChart,
        preference_bar: HorizontalBarChart,
        radar: FeatureRadar,
        heatmap: ImportanceMatrix,
        gauge: NpsGauge,
        wordcloud: OpenEndCloud,
        horizontal_bar: HorizontalBarChart,
        funnel: FunnelChart,
        scatter: ScatterPlot,
        scatter_plot: ScatterPlot,
        profile_chart: AttributeProfileChart,
        likeness_profile: LikenessProfileChart,
        funnel_ratio_cards: PurchaseFunnelRatioCardsChart,
        snake_line: PurchaseFunnelLineChart,
        reference_table: ReferenceTableChart,
        table: DataTable,
        scorecard: ScorecardGrid,
        line: LikenessProfileChart,
        verbatim_analysis: VerbatimAnalysisChart,
        sigma_intent_scatter: SigmaIntentChart,
        brand_comparison: BrandComparisonChart,
        scatter_bubble: PositioningMatrixChart,
        affinity_heatmap: AffinityHeatmap,
    };

    const chartType = chart.chart_type || 'table';
    let Component = CHART_MAP[chartType] || DataTable;

    // Specialized Chart Overrides
    if (chart.chart_id === 'brand_awareness') {
        Component = BrandAwarenessWaterfallChart;
    }

    if (exportMode) {
        return (
            <div
                ref={containerRef}
                data-export-chart-root="true"
                className="export-chart-root h-full w-full overflow-hidden"
                style={{
                    width: resolvedExportOptions.width,
                    height: resolvedExportOptions.height,
                    animation: 'none',
                    transition: 'none',
                }}
            >
                {resolvedExportOptions.includeTitle && chart.title && (
                    <div ref={headerRef} className="mb-4 shrink-0">
                        <h3 className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-black'}`}>
                            {chart.title}
                        </h3>
                    </div>
                )}
                {resolvedExportOptions.includeAiHeadline && chart.ai_headline && (
                    <div className="mb-4 shrink-0">
                        <AIInsightHeader headline={chart.ai_headline} />
                    </div>
                )}
                <div
                    className="w-full h-full relative z-10 flex flex-col justify-center overflow-hidden"
                    style={{ width: resolvedExportOptions.width, height: resolvedExportOptions.height }}
                >
                    <AsyncBoundary
                        key={chart.chart_id || chart.title}
                    >
                        <Component
                            data={chart.data}
                            title={chart.title}
                            brands={chart.brands}
                            metadata={chart.metadata}
                            isFocusMode
                            presentationHeight={presentationHeight}
                        />
                    </AsyncBoundary>
                </div>
                {resolvedExportOptions.includeFootnotes && chart.footnote && (
                    <div className="mt-2 text-xs text-slate-600 font-mono">{chart.footnote}</div>
                )}
                {resolvedExportOptions.includeAiDeepAnalysis && chart.ai_deep_analysis?.length > 0 && (
                    <div className="mt-2">
                        <AIDeepAnalysis analysisPoints={chart.ai_deep_analysis} />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={`glass-panel bg-white dark:bg-transparent rounded-[40px] border border-slate-200 dark:border-white/5 overflow-hidden relative group transition-all duration-500 ${isFocusMode ? 'p-12 min-h-0 h-[calc(100vh-160px)] flex flex-col' : 'p-10 min-h-[500px]'}`}
        >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-all">
                <Layout className="h-24 w-24" />
            </div>

            {(chart.title || chart.chart_id) && (
                <div ref={headerRef} className="mb-10 relative z-10 shrink-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-blue">
                                {(chartType || 'Visualization').replace(/_/g, ' ')}
                            </div>
                            {chart.base_n > 0 && (
                                <div className={`text-[10px] font-mono px-2 py-0.5 rounded ${isDark ? 'text-slate-400 bg-white/5' : 'text-slate-800 bg-slate-200'}`}>
                                    N={chart.base_n}
                                </div>
                            )}
                        </div>
                        <ChartCsvExportButton chart={chart} />
                    </div>
                    {chart.title && (
                        <h3 className={`text-3xl font-black italic uppercase tracking-tight ${isDark ? 'text-white' : 'text-black'}`}>
                            {chart.title}
                        </h3>
                    )}
                    {chart.subtitle && (
                        <p className={`text-sm font-medium mt-2 ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                            {chart.subtitle}
                        </p>
                    )}
                </div>
            )}

            {chart.ai_headline && (
                <div className="mb-4 z-10 relative shrink-0">
                    <AIInsightHeader headline={chart.ai_headline} />
                </div>
            )}

            <div
                className={`w-full relative z-10 flex flex-col justify-center transition-all duration-500 overflow-hidden ${isFocusMode ? 'flex-1' : 'h-auto min-h-[400px]'}`}
                style={isFocusMode ? { height: chartHeight } : {}}
            >
                <AsyncBoundary
                    key={chart.chart_id || chart.title}
                    pendingFallback={<div className="h-full w-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded-3xl" />}
                >
                    <Component
                        data={chart.data}
                        title={chart.title}
                        brands={chart.brands}
                        metadata={chart.metadata}
                        isFocusMode={isFocusMode}
                        presentationHeight={chartHeight}
                    />
                </AsyncBoundary>
            </div>

            <div ref={footerRef} className="shrink-0">
                {chart.footnote && (
                    <div className="mt-6 text-xs text-slate-600 font-mono">
                        {chart.footnote}
                    </div>
                )}

                {chart.insight && !chart.ai_deep_analysis && (
                    <div className={`mt-8 pt-8 border-t border-slate-200 dark:border-white/5 text-sm font-medium italic leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-900'}`}>
                        Neural Insight: {chart.insight}
                    </div>
                )}

                {chart.ai_deep_analysis && chart.ai_deep_analysis.length > 0 && (
                    <div className="mt-6">
                        <AIDeepAnalysis analysisPoints={chart.ai_deep_analysis} />
                    </div>
                )}
            </div>
        </div>
    );
}

