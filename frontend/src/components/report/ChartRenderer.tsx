import React from 'react';
import { PreferenceChart } from './PreferenceChart';
import { PurchaseIntentChart } from './PurchaseIntentChart';
import { FeatureRadar } from './FeatureRadar';
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
import { TornadoChart } from './TornadoChart';
import { KeyPreferenceDriversChart } from './KeyPreferenceDriversChart';
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
    const bodyRef = React.useRef<HTMLDivElement>(null);
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

    // Measure the chart body from its flex parent so focus mode fills the
    // overlay without overflowing the focus chrome (title / tabs / dots).
    React.useLayoutEffect(() => {
        if (!isFocusMode || exportMode) return;

        const body = bodyRef.current;
        if (!body) return;

        const updateHeight = () => {
            const h = Math.floor(body.clientHeight);
            if (h > 0) setChartHeight(Math.max(200, h));
        };

        updateHeight();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHeight) : null;
        ro?.observe(body);
        window.addEventListener('resize', updateHeight);
        return () => {
            ro?.disconnect();
            window.removeEventListener('resize', updateHeight);
        };
    }, [exportMode, isFocusMode, chart]);

    if (!chart) return null;

    const CHART_MAP: Record<string, React.FC<any>> = {
        criteria_table: CriteriaTableChart,
        grouped_bar: PreferenceChart,
        stacked_bar: PurchaseIntentChart,
        preference_bar: HorizontalBarChart,
        radar: FeatureRadar,
        heatmap: ScatterPlot,
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
        driver_ranking: TornadoChart,
        key_preference_drivers: KeyPreferenceDriversChart,
    };

    const chartType = chart.chart_type || 'table';
    const isCompactCard =
        chartType === 'scorecard' ||
        chartType === 'horizontal_bar' ||
        chartType === 'preference_bar' ||
        chartType === 'driver_ranking' ||
        chartType === 'profile_chart' ||
        chartType === 'snake_line';
    let Component = CHART_MAP[chartType] || DataTable;
    let displayTitle = chart.title;

    if (chart.chart_id === 'brand_awareness') {
        Component = BrandAwarenessWaterfallChart;
    } else if (chart.chart_id === 'sub_attribute_scatter') {
        Component = ScatterPlot;
        displayTitle = 'Sub-Attribute Importance Matrix';
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
                {resolvedExportOptions.includeTitle && displayTitle && (
                    <div ref={headerRef} className="mb-4 shrink-0">
                        <h3 className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-black'}`}>
                            {displayTitle}
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
            className={`panel !rounded-[28px] overflow-hidden relative group transition-all duration-500 ${isFocusMode ? 'p-6 md:p-8 min-h-0 h-full flex flex-col' : isCompactCard ? 'p-6' : 'p-8 min-h-[500px]'}`}
        >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-all">
                <Layout className="h-24 w-24" />
            </div>

            {(displayTitle || chart.chart_id) && (
                <div ref={headerRef} className={`${isFocusMode || isCompactCard ? 'mb-3' : 'mb-8'} relative z-10 shrink-0`}>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary-soft">
                                {chart.chart_id === 'sub_attribute_scatter' ? 'IMPORTANCE MATRIX' : (chartType || 'Visualization').replace(/_/g, ' ')}
                            </div>
                            {chart.base_n > 0 && (
                                <div className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-sunken text-ink-muted">
                                    N={chart.base_n}
                                </div>
                            )}
                        </div>
                        <ChartCsvExportButton chart={chart} />
                    </div>
                    {displayTitle && (
                        <h3 className={`${isFocusMode ? 'text-xl' : 'text-2xl'} font-black font-display tracking-tight text-ink`}>
                            {displayTitle}
                        </h3>
                    )}
                    {chart.subtitle && (
                        <p className="text-sm font-medium mt-2 text-ink-muted">
                            {chart.subtitle}
                        </p>
                    )}
                </div>
            )}

            {chart.ai_headline && (
                <div className={`${isCompactCard || isFocusMode ? 'mb-3' : 'mb-4'} z-10 relative shrink-0`}>
                    <AIInsightHeader headline={chart.ai_headline} />
                </div>
            )}

            <div
                ref={bodyRef}
                className={`w-full relative z-10 flex flex-col transition-all duration-500 overflow-hidden ${isFocusMode ? 'flex-1 min-h-0 justify-center' : isCompactCard ? 'h-auto justify-start' : 'h-auto min-h-[400px] justify-center'}`}
            >
                <AsyncBoundary
                    key={chart.chart_id || displayTitle}
                    pendingFallback={<div className="h-full w-full bg-surface-sunken animate-pulse rounded-3xl" />}
                >
                    <Component
                        data={chart.data}
                        title={displayTitle}
                        brands={chart.brands}
                        metadata={chart.metadata}
                        isFocusMode={isFocusMode}
                        presentationHeight={presentationHeight}
                    />
                </AsyncBoundary>
            </div>

            <div ref={footerRef} className="shrink-0">
                {chart.footnote && (
                    <div className={`${isFocusMode ? 'mt-3' : 'mt-6'} text-xs text-slate-600 font-mono`}>
                        {chart.footnote}
                    </div>
                )}

                {chart.insight && !chart.ai_deep_analysis && (
                    <div className={`${isFocusMode ? 'mt-3 pt-3' : 'mt-6 pt-6'} border-t border-line/80 dark:border-line/10 text-sm font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-900'}`}>
                        <span className="font-black text-primary-soft">Insight: </span>{chart.insight}
                    </div>
                )}

                {chart.ai_deep_analysis && chart.ai_deep_analysis.length > 0 && (
                    <div className={isFocusMode ? 'mt-3' : 'mt-6'}>
                        <AIDeepAnalysis analysisPoints={chart.ai_deep_analysis} />
                    </div>
                )}
            </div>
        </div>
    );
}

