import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, AlertCircle, RefreshCw, Activity, Database, Sparkles, LayoutPanelLeft, BarChart3, Maximize, ChevronLeft, ChevronRight, X, Sun, Moon, Layers } from 'lucide-react';
import { analytics } from '../services/api';
import { toast } from 'sonner';
import { useTheme } from '../context/ThemeContext';
import { ExecutiveSummary } from '../components/report/ExecutiveSummary';
import { MarketPositionSection } from '../components/report/MarketPositionSection';
import { ChartRenderer } from '../components/report/ChartRenderer';
import { SwotCard } from '../components/report/SwotCard';
import { SectionDivider } from '../components/report/SectionDivider';
import { ReportSkeleton } from '../components/report/ReportSkeleton';
import { FilterPanel } from '../components/report/FilterPanel';
import { TabbedChartGroup } from '../components/report/TabbedChartGroup';
import { motion, AnimatePresence } from 'framer-motion';
import { ReportProvider, useReport } from '../context/ReportContext';
import { AICostDashboard, CostData } from '../components/report/AICostDashboard';
import ProductTestAnalyticsStrip from '../components/report/ProductTestAnalyticsStrip';
import ExportConfigModal from '../components/report/ExportConfigModal';
import { useReportStatusPoll } from '../hooks/useReportStatusPoll';

// ---------------------------------------------------------------------------
// 2026 Analytical Journey Messages
// ---------------------------------------------------------------------------
const PROGRESS_MESSAGES = [
    { text: 'Synthesizing Data Fabric...', icon: <Database /> },
    { text: 'Normalizing Semantic Vectors...', icon: <Activity /> },
    { text: 'Generating Analytical Archetypes...', icon: <LayoutPanelLeft /> },
    { text: 'Cross-tabulating Brand Logic...', icon: <BarChart3 /> },
    { text: 'Synthesizing Neural Narratives...', icon: <Sparkles /> },
];

const CHART_GROUP_ORDER: Record<string, number> = {
    'Brand Profiles': 10,
    'Criteria Analysis': 20,
    'Comparisons': 30,
    'Performance': 40,
    'Purchase Funnel': 50,
    'Trends': 55,
    'Attribute Analysis': 60,
    'NPS & Loyalty': 70,
    'Verbatim Analysis': 80,
    'Dashboard': 90,
};

const CHART_PRIORITY_BY_ID: Record<string, number> = {
    criteria_table: 100,
    brand_profile_snake: 110,
    likeness_profile_chart: 120,
    sub_attribute_scatter: 130,
    overall_scatter: 140,
    product_preference: 200,
    overall_averages: 210,
    demographic_sub_averages: 220,
    purchase_funnel: 300,
    overall_switch: 310,
    switch_per_brand: 320,
    attribute_radar: 400,
    sigma_intent: 810,
    overall_scatter: 820,
    sub_attribute_scatter: 830,
    purchase_intent: 500,
    brand_comparison_pi_ol: 505,
    brand_awareness: 510, // Fallback weight if anchor chart is missing
    purchase_funnel_headline_line: 520,
    purchase_funnel_ratio_cards: 530,
    purchase_funnel_reference_table: 540,
    nps_recommend: 600,
    price_sensitivity: 610,
};

const DASHBOARD_CHART_IDS = new Set([
    'sigma_intent',
    'overall_scatter',
    'sub_attribute_scatter',
]);

const isWebVisibleChart = (chart: any): boolean => {
    if (!chart || typeof chart !== 'object') return false;
    if (chart.exclude_from_web) return false;
    if (chart.chart_type === 'importance_combined') return false;
    const chartId = String(chart.chart_id || '');
    if (chartId.startsWith('importance_combined')) return false;
    return true;
};

const resolveChartGroupName = (chart: any): string => {
    const id = chart?.chart_id;
    const t = chart?.chart_type;
    if (id && DASHBOARD_CHART_IDS.has(id)) return 'Dashboard';
    if (t === 'scorecard') return 'Brand Profiles';
    // Narrative continuity override: this profile chart is funnel-specific.
    if (id === 'purchase_funnel_headline_line' || id === 'brand_awareness' || id === 'purchase_intent') return 'Purchase Funnel';
    if (t === 'funnel_ratio_cards' || t === 'snake_line' || t === 'reference_table' || id === 'purchase_funnel') return 'Purchase Funnel';
    if (t === 'criteria_table' || t === 'profile_chart' || t === 'likeness_profile') return 'Criteria Analysis';
    if (t === 'horizontal_bar' || t === 'stacked_bar' || t === 'brand_comparison') return 'Comparisons';
    if (t === 'grouped_bar') return 'Performance';
    if (t === 'funnel') return 'Purchase Funnel';
    if (t === 'radar') return 'Attribute Analysis';
    if (t === 'gauge') return 'NPS & Loyalty';
    if (t === 'wordcloud') return 'Verbatim Analysis';
    if (t === 'line') return 'Trends';
    return 'Dashboard';
};

const buildOrderedCharts = (rawCharts: any[]): any[] => {
    const prepared = rawCharts.map((chart, idx) => {
        const group = resolveChartGroupName(chart);
        return {
            chart,
            idx,
            group,
            groupOrder: CHART_GROUP_ORDER[group] ?? 999,
            idPriority: CHART_PRIORITY_BY_ID[chart?.chart_id] ?? 9999,
            titleKey: String(chart?.title || '').toLowerCase(),
        };
    });

    prepared.sort((a, b) => {
        if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
        if (a.idPriority !== b.idPriority) return a.idPriority - b.idPriority;
        if (a.titleKey !== b.titleKey) return a.titleKey.localeCompare(b.titleKey);
        return a.idx - b.idx; // Stable fallback for deterministic ordering.
    });

    const ordered = prepared.map((p) => p.chart);
    const purchaseIdx = ordered.findIndex((c) => c?.chart_id === 'purchase_intent');
    const baIdx = ordered.findIndex((c) => c?.chart_id === 'brand_awareness');

    // Anchor policy: place brand_awareness immediately after purchase_intent.
    if (purchaseIdx >= 0 && baIdx >= 0 && baIdx !== purchaseIdx + 1) {
        const [baChart] = ordered.splice(baIdx, 1);
        const insertAt = purchaseIdx < baIdx ? purchaseIdx + 1 : purchaseIdx + 1;
        ordered.splice(insertAt, 0, baChart);
    }

    return ordered;
};

export default function SurveyReport() {
    const { surveyId } = useParams<{ surveyId: string }>();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progressIdx, setProgressIdx] = useState(0);

    // Advanced Filtering State
    const [activeFilters, setActiveFilters] = useState<{ brands?: string[]; demographics?: Record<string, string[]> }>({});
    const [isSlicing, setIsSlicing] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Move activeGroupIndex to ReportContext
    // const [activeGroupIndex, setActiveGroupIndex] = useState(0);

    const toggleFocusMode = useCallback(() => {
        if (!isFocusMode) {
            setIsFocusMode(true);
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            }
        } else {
            setIsFocusMode(false);
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }, [isFocusMode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFocusMode) {
                setIsFocusMode(false);
                if (document.fullscreenElement && document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        };
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setIsFocusMode(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [isFocusMode]);

    // Progress Ticker
    useEffect(() => {
        if (!isGenerating) return;
        const interval = setInterval(() => {
            setProgressIdx((prev) => (prev + 1) % PROGRESS_MESSAGES.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [isGenerating]);

    const fetchReport = useCallback(async () => {
        try {
            if (!surveyId) return;
            setError(null);

            const data = await analytics.getReport(surveyId);

            if (data?.status === 'failed') {
                const msg = data.error_message || 'The report could not be generated at this time.';
                setError(msg);
                setIsGenerating(false);
                setLoading(false);
                return;
            }

            setReport(data);
            setIsGenerating(false);
            setLoading(false);
        } catch (err: any) {
            if (err.response?.status === 202) {
                setIsGenerating(true);
                setLoading(false);
            } else if (err.response?.status === 404) {
                setLoading(false);
                handleGenerate();
            } else {
                setError('Failed to reach neural engine.');
                setLoading(false);
            }
        }
    }, [surveyId]);

    useReportStatusPoll({
        surveyId,
        enabled: isGenerating,
        watch: 'report',
        onTerminal: (statusData, reason) => {
            if (reason === 'report_ready') {
                fetchReport();
                toast.success('Neural Synthesis Complete');
            } else if (reason === 'report_failed') {
                setError(statusData.error || 'Generation Failed');
                setIsGenerating(false);
            }
        },
        onUpdate: () => { },
    });

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const handleDownload = async () => {
        setIsExportModalOpen(true);
    };

    const handleApplySlice = async () => {
        try {
            setIsSlicing(true);
            toast.loading('Slicing Data Matrix...', { id: 'slice' });

            const slicePayload = await analytics.slice(surveyId!, activeFilters);

            // Merge sliced charts and new base_n into existing report state
            setReport((prev: any) => ({
                ...prev,
                charts: slicePayload.charts,
                base_n: slicePayload.base_n,
            }));

            toast.success('Matrix Realigned', { id: 'slice' });
        } catch (err: any) {
            toast.error('Failed to slice data', { id: 'slice' });
        } finally {
            setIsSlicing(false);
        }
    };

    const handleGenerate = async (force: boolean = false) => {
        try {
            if (!surveyId) return;
            setIsGenerating(true);
            setError(null);

            if (force) {
                toast.info('Triggering full neural synthesis override...', {
                    description: 'Cache invalidation active. All AI insights will be regenerated.',
                    icon: <Sparkles className="text-brand-accent h-4 w-4" />
                });
            } else {
                toast.info('Initiating analytical report generation...');
            }

            await analytics.generateReport(surveyId, {}, force);
        } catch (err: any) {
            setIsGenerating(false);
            const msg = err.response?.data?.detail || 'Handshake error.';
            setError(msg);
            toast.error('Neural Handshake Failed', { description: msg });
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12"><ReportSkeleton /></div>;

    if (isGenerating) {
        const step = PROGRESS_MESSAGES[progressIdx];
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-slate-950 px-6 overflow-hidden">
                <div className="absolute inset-0 bg-mesh overflow-hidden -z-10 opacity-30">
                    <div className="mesh-orb w-96 h-96 bg-indigo-100 dark:bg-brand-blue/30 top-1/4 left-1/4 animate-pulse-soft"></div>
                    <div className="mesh-orb w-[500px] h-[500px] bg-rose-50 dark:bg-brand-accent/20 bottom-1/4 right-1/4 animate-pulse-soft" style={{ animationDelay: '1s' }}></div>
                </div>
                <div className="relative mb-12">
                    <div className="absolute inset-0 bg-brand-blue/20 rounded-full blur-3xl animate-pulse"></div>
                    <div className="w-32 h-32 border-c-4 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin flex items-center justify-center">
                        <RefreshCw className="h-12 w-12 text-brand-blue animate-pulse" />
                    </div>
                </div>
                <h2 className="text-5xl font-black text-slate-900 dark:text-white mb-6 uppercase tracking-tight italic">
                    Architecting <span className="text-brand-blue">Strategy</span>
                </h2>
                <div className="flex items-center gap-4 text-slate-400 font-bold text-xl h-10 transition-all">
                    <span className="text-brand-blue">{step.icon}</span>
                    <span className="animate-fade-in tracking-wide">{step.text}</span>
                </div>
                <div className="w-64 bg-slate-200 dark:bg-slate-800 rounded-full h-1 mt-12 overflow-hidden">
                    <div className="bg-gradient-to-r from-brand-blue to-cyan-400 h-full animate-[progress_2s_infinite]" />
                </div>
            </div>
        );
    }

    if (error || (report && report.status === 'failed')) {
        return (
            <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
                <div className="glass-panel p-16 rounded-[40px] max-w-2xl border border-slate-100 dark:border-white/10 shadow-[0_32px_64px_rgba(0,0,0,0.06)] dark:shadow-2xl bg-white dark:bg-transparent">
                    <AlertCircle className="h-24 w-24 text-brand-accent mx-auto mb-8 animate-bounce" />
                    <h2 className="text-5xl font-black text-slate-900 dark:text-white mb-6 uppercase tracking-tighter italic">Interrupted</h2>
                    <p className="text-slate-400 text-xl font-medium mb-12 leading-relaxed">{error || report?.error_message}</p>
                    <button onClick={() => handleGenerate(true)} className="btn-premium px-12 py-5 text-xl tracking-widest uppercase">
                        Force Restart
                    </button>
                </div>
            </div>
        );
    }

    const hasPptx = report?.pptx_path && report.pptx_path.trim() !== '';

    // NEW PIPELINE: Use flat charts[] if available, otherwise fallback to sections
    const hasNewPipeline = report?.charts && report.charts.length > 0;
    const allCharts = buildOrderedCharts(
        (hasNewPipeline ? report.charts : []).filter(isWebVisibleChart)
    );

    // Isolate strategic charts for the MarketPositionSection
    const strategicChartIds = ['market_position_sigma', 'audience_affinity', 'competitive_position_matrix'];
    const strategicCharts = allCharts.filter((c: any) => strategicChartIds.includes(c.chart_id));
    const charts = allCharts.filter((c: any) => !strategicChartIds.includes(c.chart_id));

    // Group charts by type for sidebar navigation
    const chartGroups: Record<string, any[]> = {};
    charts.forEach((chart: any) => {
        const group = resolveChartGroupName(chart);
        if (!chartGroups[group]) chartGroups[group] = [];
        chartGroups[group].push(chart);
    });

    const groupNames = Object.keys(chartGroups);

    return (
        <ReportProvider>
            <ReportContent
                report={report}
                isFocusMode={isFocusMode}
                toggleFocusMode={toggleFocusMode}
                activeFilters={activeFilters}
                setActiveFilters={setActiveFilters}
                handleApplySlice={handleApplySlice}
                isSlicing={isSlicing}
                isDark={isDark}
                toggleTheme={toggleTheme}
                handleGenerate={handleGenerate}
                handleDownload={handleDownload}
                hasPptx={!!hasPptx}
                charts={charts}
                strategicCharts={strategicCharts}
                chartGroups={chartGroups}
                groupNames={groupNames}
                hasNewPipeline={hasNewPipeline}
                loading={loading}
                navigate={navigate}
                isExportModalOpen={isExportModalOpen}
                setIsExportModalOpen={setIsExportModalOpen}
                onExportReady={fetchReport}
            />
        </ReportProvider>
    );
}

// Separate internal component to use context
interface ReportContentProps {
    report: any;
    isFocusMode: boolean;
    toggleFocusMode: () => void;
    activeFilters: any;
    setActiveFilters: (filters: any) => void;
    handleApplySlice: () => Promise<void>;
    isSlicing: boolean;
    isDark: boolean;
    toggleTheme: () => void;
    handleGenerate: (force?: boolean) => Promise<void>;
    handleDownload: () => Promise<void>;
    hasPptx: boolean;
    charts: any[];
    strategicCharts: any[];
    chartGroups: Record<string, any[]>;
    groupNames: string[];
    hasNewPipeline: boolean;
    loading: boolean;
    navigate: (path: string) => void;
    isExportModalOpen: boolean;
    setIsExportModalOpen: (open: boolean) => void;
    onExportReady: () => Promise<void>;
}

function ReportContent({
    report, isFocusMode, toggleFocusMode, activeFilters, setActiveFilters,
    handleApplySlice, isSlicing, isDark, toggleTheme, handleGenerate,
    handleDownload, hasPptx, charts, strategicCharts, chartGroups, groupNames, hasNewPipeline,
    loading, navigate, isExportModalOpen, setIsExportModalOpen, onExportReady
}: ReportContentProps) {
    const { surveyId } = useParams<{ surveyId: string }>();
    const { activeGroupIndex, setActiveGroupIndex, registerChartLocation } = useReport();

    // AI Cost Dashboard State
    const [isCostModalOpen, setIsCostModalOpen] = useState(false);
    const [costData, setCostData] = useState<CostData | null>(null);
    const [isLoadingCosts, setIsLoadingCosts] = useState(false);

    const handleViewAICosts = async () => {
        setIsCostModalOpen(true);
        if (!costData && surveyId) {
            try {
                setIsLoadingCosts(true);
                // Attempt to fetch from the explicit endpoint
                const data = await analytics.getAiCosts(surveyId);
                setCostData(data);
            } catch (e) {
                // Fallback to telemetry payload if explicitly requested API errors out dynamically
                if (report?.telemetry?.ai_cost_manifest) {
                    setCostData(report.telemetry.ai_cost_manifest);
                } else {
                    toast.error("Failed to load AI Telemetry Costs.");
                }
            } finally {
                setIsLoadingCosts(false);
            }
        }
    };

    // Register all chart locations for intelligent navigation
    useEffect(() => {
        if (hasNewPipeline) {
            groupNames.forEach((group: string, gIdx: number) => {
                chartGroups[group].forEach((chart: any, cIdx: number) => {
                    registerChartLocation(chart.chart_id, gIdx, cIdx, group);
                });
            });
        }
    }, [chartGroups, groupNames, hasNewPipeline, registerChartLocation]);
    return (
        <div className="min-h-screen bg-white dark:bg-[#020617] text-slate-900 dark:text-slate-100 selection:bg-brand-blue/20">
            {/* Global Mesh Gradient Background */}
            <div className="bg-mesh">
                <div className="mesh-orb w-[600px] h-[600px] bg-indigo-50/50 dark:bg-brand-blue/10 top-0 left-[-10%]"></div>
                <div className="mesh-orb w-[800px] h-[800px] bg-brand-accent/5 bottom-0 right-[-10%]"></div>
            </div>

            {/* Premium Sticky Header */}
            <header className={`sticky top-0 z-40 bg-white/90 dark:bg-slate-950/80 backdrop-blur-3xl border-b border-indigo-100 dark:border-white/5 py-6 transition-all duration-700 ${isFocusMode ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
                <div className="max-w-[1600px] mx-auto px-8 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => navigate('/surveys')}
                            className="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400 mr-2 group"
                            title="Back to Dashboard"
                        >
                            <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div className="p-3 bg-brand-blue/10 rounded-2xl border border-brand-blue/20">
                            <Activity className="h-6 w-6 text-brand-blue" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black uppercase tracking-tight italic">
                                {report.project_name || 'Strategic Analysis'}
                            </h1>
                            <div className="flex gap-2 mt-1 flex-wrap">
                                {(report.brands || report.brand_list)?.slice(0, 5).map((b: string, i: number) => (
                                    <span key={`${b}-${i}`} className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-500 bg-white dark:bg-slate-900/50 px-2 py-0.5 rounded border border-slate-200 dark:border-white/5">
                                        {b}
                                    </span>
                                ))}
                                {hasNewPipeline && (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/20">
                                        V2 • {charts.length} Charts
                                    </span>
                                )}
                                {report?.telemetry?.document_cache_hit && (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/20 flex items-center gap-1">
                                        <Database className="w-2.5 h-2.5" />
                                        Neural Cache
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <FilterPanel
                            availableFilters={report?.available_filters || {}}
                            brands={report?.brands || report?.brand_list || []}
                            activeFilters={activeFilters}
                            onChange={setActiveFilters}
                            onApply={handleApplySlice}
                            isApplying={isSlicing}
                        />
                        <button onClick={toggleFocusMode} className="p-3 bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue border border-brand-blue/20 dark:border-brand-blue/30 rounded-2xl hover:bg-brand-blue hover:text-white transition-all shadow-sm" title="Enter Focus Mode">
                            <Maximize className="h-5 w-5" />
                        </button>
                        <button
                            onClick={toggleTheme}
                            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400 group relative overflow-hidden active:scale-90"
                            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        >
                            <motion.div
                                initial={false}
                                animate={{ rotate: isDark ? 0 : 90, scale: isDark ? 1 : 0 }}
                                transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            >
                                <Sun className="h-5 w-5 text-amber-400" />
                            </motion.div>
                            <motion.div
                                initial={false}
                                animate={{ rotate: isDark ? -90 : 0, scale: isDark ? 0 : 1 }}
                                transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            >
                                <Moon className="h-5 w-5" />
                            </motion.div>
                            <div className="h-5 w-5 opacity-0">.</div> {/* Spacer */}
                        </button>
                        <button onClick={() => handleGenerate(true)} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400 hover:text-brand-blue dark:hover:text-white" title="Regenerate">
                            <RefreshCw className="h-5 w-5" />
                        </button>
                        {localStorage.getItem('role') === 'admin' && (
                            <button
                                onClick={handleViewAICosts}
                                className="p-3 bg-white dark:bg-emerald-900/10 border border-slate-200 dark:border-emerald-500/20 rounded-2xl hover:bg-slate-100 dark:hover:bg-emerald-900/30 transition-all text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 group relative"
                                title="View AI Costs"
                            >
                                <Database className="h-5 w-5" />
                                {isLoadingCosts && (
                                    <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                )}
                            </button>
                        )}
                        <button
                            onClick={handleDownload}
                            className="btn-premium flex items-center gap-3 active:scale-95 transition-transform"
                            title={hasPptx ? "Download or rebuild presentation" : "Generate presentation export"}
                        >
                            <Download className="h-5 w-5" />
                            <span className="uppercase tracking-widest text-sm font-bold">
                                {hasPptx ? 'Download PPTX' : 'Export PPTX'}
                            </span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Immersive Focus Mode Overlay (Slide Presentation Engine) */}
            {isFocusMode && (
                <div className="fixed inset-0 z-[100] bg-white dark:bg-[#020617] p-8 md:p-12 overflow-hidden flex flex-col animate-fade-in focus-mode-overlay">
                    <div className="flex justify-between items-center mb-10 shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-brand-blue/10 rounded-2xl border border-brand-blue/20">
                                <Activity className="h-8 w-8 text-brand-blue" />
                            </div>
                            <div>
                                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight italic text-slate-900 dark:text-white leading-tight">
                                    {report.project_name}
                                </h2>
                                <div className="flex items-center gap-3 mt-1">
                                    <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-[0.3em]">Strategic Immersion Engine</p>
                                    <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/5 mr-4">
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Slide</span>
                                <span className="text-brand-blue font-black font-mono text-lg">{activeGroupIndex + 1}</span>
                                <span className="text-slate-600 font-bold mx-1">/</span>
                                <span className="text-slate-500 font-bold font-mono">{groupNames.length}</span>
                            </div>
                            <button
                                onClick={toggleTheme}
                                className="p-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400 relative overflow-hidden active:scale-95"
                                title="Toggle Theme"
                            >
                                <motion.div
                                    initial={false}
                                    animate={{ rotate: isDark ? 0 : 90, scale: isDark ? 1 : 0 }}
                                    transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                >
                                    <Sun className="h-6 w-6 text-amber-400" />
                                </motion.div>
                                <motion.div
                                    initial={false}
                                    animate={{ rotate: isDark ? -90 : 0, scale: isDark ? 0 : 1 }}
                                    transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                >
                                    <Moon className="h-6 w-6" />
                                </motion.div>
                                <div className="h-6 w-6 opacity-0">.</div>
                            </button>
                            <button
                                onClick={toggleFocusMode}
                                className="p-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl hover:bg-rose-500/10 hover:text-rose-500 transition-all text-slate-400"
                            >
                                <X className="h-8 w-8" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 flex items-center gap-8 relative overflow-hidden group/nav">
                        {/* Slide Navigation: Previous */}
                        <button
                            disabled={activeGroupIndex === 0}
                            onClick={() => setActiveGroupIndex((prev: any) => prev - 1)}
                            className={`p-6 rounded-full border bg-white dark:bg-slate-900 shadow-2xl transition-all z-20 shrink-0 ${activeGroupIndex === 0 ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-0 group-hover/nav:opacity-100 scale-100 active:scale-90 border-slate-200 dark:border-white/10 text-slate-400 hover:text-brand-blue hover:border-brand-blue/30'}`}
                        >
                            <ChevronLeft className="h-10 w-10" />
                        </button>

                        <div className="flex-1 h-full min-h-0 relative">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={groupNames[activeGroupIndex]}
                                    initial={{ opacity: 0, x: 50 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -50 }}
                                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                                    className="h-full flex flex-col pt-4"
                                >
                                    <div className="flex items-center gap-6 mb-8 shrink-0">
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-brand-blue/20 to-transparent" />
                                        <h3 className={`text-4xl md:text-5xl font-black uppercase tracking-tighter italic ${isDark ? 'text-white' : 'text-slate-900'}`}>{groupNames[activeGroupIndex]}</h3>
                                        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-brand-blue/20 to-transparent" />
                                    </div>
                                    <div className="flex-1 min-h-0">
                                        <TabbedChartGroup
                                            groupName={groupNames[activeGroupIndex]}
                                            charts={chartGroups[groupNames[activeGroupIndex]]}
                                            isFocusMode={true}
                                        />
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Slide Navigation: Next */}
                        <button
                            disabled={activeGroupIndex === groupNames.length - 1}
                            onClick={() => setActiveGroupIndex((prev: any) => prev + 1)}
                            className={`p-6 rounded-full border bg-white dark:bg-slate-900 shadow-2xl transition-all z-20 shrink-0 ${activeGroupIndex === groupNames.length - 1 ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-0 group-hover/nav:opacity-100 scale-100 active:scale-90 border-slate-200 dark:border-white/10 text-slate-400 hover:text-brand-blue hover:border-brand-blue/30'}`}
                        >
                            <ChevronRight className="h-10 w-10" />
                        </button>
                    </div>

                    <div className="mt-10 shrink-0 flex justify-center gap-3">
                        {groupNames.map((_: any, idx: number) => (
                            <button
                                key={`nav-dot-${idx}`}
                                onClick={() => setActiveGroupIndex(idx)}
                                className={`h-1.5 rounded-full transition-all duration-500 ${idx === activeGroupIndex ? 'w-12 bg-brand-blue shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'w-3 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20'}`}
                            />
                        ))}
                    </div>
                </div>
            )}

            <main className="max-w-[1600px] mx-auto px-8 py-16 flex items-start relative">
                {/* Left Sidebar - High-Fidelity Fixed Navigation */}
                <aside
                    className={`fixed left-[calc(max(2rem, (100vw - 1600px) / 2 + 2rem))] top-28 w-72 hidden xl:block transition-all duration-500 z-30 ${isFocusMode ? '!hidden opacity-0 pointer-events-none' : ''}`}
                >
                    <div className="glass-panel p-6 rounded-[2.5rem] border border-indigo-100/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40 backdrop-blur-3xl shadow-premium">
                        <div className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500 mb-6 px-2 flex items-center justify-between">
                            <span>Architecture</span>
                            <Layers className="w-3 h-3 opacity-30" />
                        </div>

                        <nav className="space-y-1">
                            <ul className="space-y-1">
                                <li className="group">
                                    <a href="#summary" className="flex items-center justify-between p-3 rounded-2xl transition-all hover:bg-slate-100/50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95 group-active:text-brand-blue">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 group-hover:bg-brand-blue transition-all" />
                                            <span className="font-bold text-[11px] uppercase tracking-widest leading-tight">Overview</span>
                                        </div>
                                    </a>
                                </li>
                                {report?.insights?.market_position_report && (
                                    <li className="group">
                                        <a href="#strategic-positioning" className="flex items-center justify-between p-3 rounded-2xl transition-all hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 active:scale-95">
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/20 group-hover:bg-emerald-500 transition-all" />
                                                <span className="font-bold text-[11px] uppercase tracking-widest leading-tight">Strategic Intelligence</span>
                                            </div>
                                            <Sparkles className="w-3 h-3 opacity-50" />
                                        </a>
                                    </li>
                                )}
                                {hasNewPipeline ? (
                                    groupNames.map((group: string, i: number) => (
                                        <li key={group} className="group">
                                            <a href={`#group-${i}`} className="flex items-center justify-between p-3 rounded-2xl transition-all hover:bg-slate-100/50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95 group-active:text-brand-blue">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 group-hover:bg-brand-blue transition-all shrink-0" />
                                                    <span className="font-bold text-[11px] uppercase tracking-widest leading-tight whitespace-normal">{group}</span>
                                                </div>
                                                <span className="text-[9px] font-black text-brand-blue/60 group-hover:text-brand-blue font-mono ml-2 border border-brand-blue/10 px-2 py-0.5 rounded-lg bg-brand-blue/5 shrink-0">
                                                    {chartGroups[group].length}
                                                </span>
                                            </a>
                                        </li>
                                    ))
                                ) : (
                                    report.sections?.map((section: any, i: number) => (
                                        <li key={i} className="group">
                                            <a href={`#section-${i}`} className="flex items-center justify-between p-3 rounded-2xl transition-all hover:bg-slate-100/50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95 group-active:text-brand-blue">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 group-hover:bg-brand-blue transition-all shrink-0" />
                                                    <span className="font-bold text-[11px] uppercase tracking-widest leading-tight whitespace-normal">{section.section_name}</span>
                                                </div>
                                            </a>
                                        </li>
                                    ))
                                )}
                            </ul>

                            {report.base_n > 0 && (
                                <div className="mt-8 p-5 bg-slate-50/50 dark:bg-slate-900/40 rounded-[2rem] border border-slate-200/50 dark:border-white/5 group hover:border-brand-blue/20 transition-all">
                                    <div className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2 flex items-center justify-between">
                                        SAMPLE
                                        <Database className="w-2.5 h-2.5 opacity-20" />
                                    </div>
                                    <div className="text-2xl font-black text-brand-blue font-display tracking-tight group-hover:scale-105 transition-transform duration-500">
                                        N={report.base_n}
                                    </div>
                                    <div className="mt-2 w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: '100%' }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                            className="h-full bg-brand-blue shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                                        />
                                    </div>
                                </div>
                            )}
                        </nav>
                    </div>
                </aside>

                {/* Main Content - Padded to avoid overlap */}
                <div className={`flex-1 min-w-0 xl:ml-[352px] space-y-32 pb-32 transition-all duration-500`}>
                    {/* Executive Summary Section */}
                    <section id="summary" className="scroll-mt-40 animate-fade-in">
                        <div className="flex items-center gap-4 mb-12">
                            <div className="h-1 w-12 bg-brand-blue rounded-full"></div>
                            <h2 className="text-3xl font-black uppercase tracking-widest italic text-slate-400">Business Objective</h2>
                        </div>
                        {surveyId && <ProductTestAnalyticsStrip surveyId={surveyId} />}
                        {report.insights && (
                            <ExecutiveSummary
                                summary={report.insights.executive_summary}
                                findings={report.insights.key_findings}
                                opportunity_insights={report.insights.opportunity_insights}
                                surveyId={surveyId}
                                editable={['admin', 'analyst'].includes(localStorage.getItem('role') || '')}
                            />
                        )}
                    </section>

                    {/* Strategic Command Center - Integrated AI Layer */}
                    {report.insights?.market_position_report && (
                        <section id="strategic-positioning" className="scroll-mt-40 animate-slide-up">
                            <div className="flex items-center gap-4 mb-12">
                                <div className="h-1 w-12 bg-emerald-500 rounded-full"></div>
                                <h2 className="text-3xl font-black uppercase tracking-widest italic text-slate-400">Strategic Intelligence</h2>
                            </div>
                            <MarketPositionSection
                                data={report.insights.market_position_report}
                                strategicCharts={strategicCharts}
                            />
                        </section>
                    )}

                    {hasNewPipeline ? (
                        groupNames.map((group: string, gIdx: number) => (
                            <section key={group} id={`group-${gIdx}`} className="scroll-mt-40 space-y-16 animate-slide-up" style={{ animationDelay: `${gIdx * 0.1}s` }}>
                                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-8">
                                    <div className="space-y-2">
                                        <div className="text-xs font-black text-brand-blue uppercase tracking-[0.4em]">Section — {String(gIdx + 1).padStart(2, '0')}</div>
                                        <h3 className="text-5xl font-black uppercase tracking-tighter italic text-slate-900 dark:text-white">{group}</h3>
                                    </div>
                                    <div className="px-6 py-2 bg-brand-blue/10 border border-brand-blue/20 rounded-full text-brand-blue text-xs font-black uppercase tracking-widest">
                                        {chartGroups[group].length} {chartGroups[group].length === 1 ? 'Visualization' : 'Visualizations'}
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <TabbedChartGroup groupName={group} charts={chartGroups[group]} isFocusMode={isFocusMode} />
                                </div>
                            </section>
                        ))
                    ) : (
                        report.sections?.map((section: any, idx: number) => (
                            <section key={idx} id={`section-${idx}`} className="scroll-mt-40 space-y-16 animate-slide-up" style={{ animationDelay: `${idx * 0.1}s` }}>
                                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-8">
                                    <div className="space-y-2">
                                        <div className="text-xs font-black text-brand-blue uppercase tracking-[0.4em]">Section — {String(idx + 1).padStart(2, '0')}</div>
                                        <h3 className="text-5xl font-black uppercase tracking-tighter italic text-slate-900 dark:text-white">{section.section_name}</h3>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-12">
                                    {section.charts?.map((chart: any, cIdx: number) => (
                                        <div key={cIdx} className="hover:scale-[1.01] transition-transform duration-500">
                                            <ChartRenderer chart={chart} isFocusMode={isFocusMode} />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))
                    )}

                    {/* AI Strategic Layers */}
                    {report.insights?.brand_swot && Object.keys(report.insights.brand_swot).length > 0 && (
                        <section id="swot" className="space-y-16">
                            <SectionDivider title="Competitive Archetypes" />
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {Object.entries(report.insights.brand_swot).map(([brand, swot]: [string, any]) => (
                                    <SwotCard key={brand} brand={brand} swot={swot} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </main>

            {/* Scroll Progress Bar */}
            <div className="fixed bottom-0 left-0 w-full h-1.5 bg-slate-200 dark:bg-slate-900 z-50">
                <div className="h-full bg-gradient-to-r from-brand-blue to-purple-500 transition-all duration-300"
                    style={{ width: `${loading ? 0 : 100}%` }} />
            </div>

            {localStorage.getItem('role') === 'admin' && (
                <AICostDashboard
                    isOpen={isCostModalOpen}
                    onClose={() => setIsCostModalOpen(false)}
                    costData={costData}
                />
            )}

            <ExportConfigModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                surveyId={surveyId!}
                hasPptx={hasPptx}
                onExportReady={onExportReady}
            />
        </div>
    );
}
