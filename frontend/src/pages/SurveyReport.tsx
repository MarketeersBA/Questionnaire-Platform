import { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, AlertCircle, RefreshCw, Activity, Database, Sparkles, LayoutPanelLeft, BarChart3, Maximize, ChevronLeft, ChevronRight, X, Sun, Moon, LayoutDashboard, ClipboardList, FileText, ArrowUp, ChevronDown } from 'lucide-react';
import { analytics } from '../services/api';
import { toast } from 'sonner';
import { useTheme } from '../context/ThemeContext';
import { ExecutiveSummary } from '../components/report/ExecutiveSummary';
import { ReportKpiRow } from '../components/report/ReportKpiRow';
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
import { useScrollSpy } from '../hooks/useScrollSpy';

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
    'Appraisal': 25,
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
    driver_ranking: 835,
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
    'driver_ranking',
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
    if (t === 'criteria_table') return 'Criteria Analysis';
    // "Main Insights" is the recognizable business term for the attribute-by-attribute
    // profile/likeness charts — surfaced as its own labeled section rather than
    // buried under the generic "Criteria Analysis" heading.
    if (t === 'profile_chart' || t === 'likeness_profile' || t === 'key_preference_drivers') return 'Main Insights';
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
            chart: { ...chart, group },
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
    const enteredFullscreenRef = useRef(false);

    // Move activeGroupIndex to ReportContext
    // const [activeGroupIndex, setActiveGroupIndex] = useState(0);

    const toggleFocusMode = useCallback(() => {
        if (!isFocusMode) {
            setIsFocusMode(true);
            enteredFullscreenRef.current = false;
            const req = document.documentElement.requestFullscreen?.();
            if (req && typeof (req as Promise<void>).then === 'function') {
                (req as Promise<void>)
                    .then(() => { enteredFullscreenRef.current = true; })
                    .catch(() => { enteredFullscreenRef.current = false; });
            }
        } else {
            setIsFocusMode(false);
            if (enteredFullscreenRef.current && document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => { });
            }
            enteredFullscreenRef.current = false;
        }
    }, [isFocusMode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFocusMode) {
                setIsFocusMode(false);
                if (enteredFullscreenRef.current && document.fullscreenElement) {
                    document.exitFullscreen?.().catch(() => { });
                }
                enteredFullscreenRef.current = false;
            }
        };
        const handleFullscreenChange = () => {
            // Only tear down focus mode when *our* fullscreen session ends
            // (Esc / browser UI). Do not close if fullscreen was never granted.
            if (!document.fullscreenElement && enteredFullscreenRef.current) {
                enteredFullscreenRef.current = false;
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

    if (loading) return <div className="min-h-screen bg-surface-raised py-12"><ReportSkeleton /></div>;

    if (isGenerating) {
        const step = PROGRESS_MESSAGES[progressIdx];
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface px-6 overflow-hidden">
                <div className="absolute inset-0 bg-mesh overflow-hidden -z-10 opacity-30">
                    <div className="mesh-orb w-96 h-96 bg-indigo-100 dark:bg-primary/30 top-1/4 left-1/4 animate-pulse-soft"></div>
                    <div className="mesh-orb w-[500px] h-[500px] bg-rose-50 dark:bg-brand-accent/20 bottom-1/4 right-1/4 animate-pulse-soft" style={{ animationDelay: '1s' }}></div>
                </div>
                <div className="relative mb-12">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
                    <div className="w-32 h-32 border-c-4 border-primary/20 border-t-brand-blue rounded-full animate-spin flex items-center justify-center">
                        <RefreshCw className="h-12 w-12 text-primary-soft animate-pulse" />
                    </div>
                </div>
                <h2 className="text-5xl font-black text-ink mb-6 uppercase tracking-tight italic">
                    Architecting <span className="text-primary-soft">Strategy</span>
                </h2>
                <div className="flex items-center gap-4 text-slate-400 font-bold text-xl h-10 transition-all">
                    <span className="text-primary-soft">{step.icon}</span>
                    <span className="animate-fade-in tracking-wide">{step.text}</span>
                </div>
                <div className="w-64 bg-slate-200 dark:bg-slate-800 rounded-full h-1 mt-12 overflow-hidden">
                    <div className="bg-gradient-to-r from-primary to-cyan-400 h-full animate-[progress_2s_infinite]" />
                </div>
            </div>
        );
    }

    if (error || (report && report.status === 'failed')) {
        return (
            <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-8 text-center">
                <div className="glass-panel p-16 rounded-[40px] max-w-2xl border border-line/80 dark:border-line/10 shadow-[0_32px_64px_rgba(0,0,0,0.06)] dark:shadow-2xl bg-white dark:bg-transparent">
                    <AlertCircle className="h-24 w-24 text-brand-accent mx-auto mb-8 animate-bounce" />
                    <h2 className="text-5xl font-black text-ink mb-6 uppercase tracking-tighter italic">Interrupted</h2>
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

    // Ids of every scrollable section, in document order, for the sidebar's
    // active-state tracking.
    const sectionIds = useMemo(() => {
        const ids = ['summary'];
        if (report?.insights?.market_position_report) ids.push('strategic-positioning');
        if (hasNewPipeline) {
            groupNames.forEach((_: string, i: number) => ids.push(`group-${i}`));
        } else {
            (report?.sections || []).forEach((_: any, i: number) => ids.push(`section-${i}`));
        }
        return ids;
    }, [report, groupNames, hasNewPipeline]);

    // Rail visibility is user-controlled; focus mode hides it regardless.
    const [railOpen, setRailOpen] = useState(true);
    const [goToOpen, setGoToOpen] = useState(false);
    const railVisible = railOpen && !isFocusMode;
    const wasFocusMode = useRef(false);
    const headerRef = useRef<HTMLElement>(null);
    const [headerHeight, setHeaderHeight] = useState(96);

    const activeSectionId = useScrollSpy(sectionIds, Math.max(120, headerHeight + 16));

    // Entering focus mode: jump to the section the reader was looking at.
    useEffect(() => {
        if (isFocusMode && !wasFocusMode.current) {
            if (activeSectionId?.startsWith('group-')) {
                const idx = Number(activeSectionId.slice('group-'.length));
                if (Number.isInteger(idx) && idx >= 0 && idx < groupNames.length) {
                    setActiveGroupIndex(idx);
                }
            } else if (groupNames.length > 0 && activeGroupIndex >= groupNames.length) {
                setActiveGroupIndex(0);
            }
        }
        wasFocusMode.current = isFocusMode;
    }, [isFocusMode, activeSectionId, groupNames, activeGroupIndex, setActiveGroupIndex]);

    // Keep slide index in range if groups change under us.
    useEffect(() => {
        if (groupNames.length === 0) return;
        if (activeGroupIndex > groupNames.length - 1) {
            setActiveGroupIndex(groupNames.length - 1);
        }
    }, [groupNames.length, activeGroupIndex, setActiveGroupIndex]);

    // Arrow keys move between slides while immersed.
    useEffect(() => {
        if (!isFocusMode || groupNames.length === 0) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                setActiveGroupIndex((prev: number) => Math.min(groupNames.length - 1, prev + 1));
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                setActiveGroupIndex((prev: number) => Math.max(0, prev - 1));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isFocusMode, groupNames.length, setActiveGroupIndex]);

    const focusGroupName = groupNames[Math.min(activeGroupIndex, Math.max(groupNames.length - 1, 0))];
    const focusCharts = focusGroupName ? chartGroups[focusGroupName] : undefined;

    // Lock page scroll while the immersion overlay owns the viewport.
    useEffect(() => {
        if (!isFocusMode) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isFocusMode]);

    // Back-to-top only earns its place once the reader is well down the page.
    const [showToTop, setShowToTop] = useState(false);
    useEffect(() => {
        const onScroll = () => setShowToTop(window.scrollY > 600);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const scrollToTop = () =>
        window.scrollTo({ top: 0, behavior: 'smooth' });

    // Keep a live spacer under the fixed header so content never sits underneath it.
    useLayoutEffect(() => {
        const el = headerRef.current;
        if (!el || isFocusMode) return;
        const update = () => setHeaderHeight(el.offsetHeight);
        update();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
        ro?.observe(el);
        window.addEventListener('resize', update);
        return () => {
            ro?.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [isFocusMode, report?.project_name, railVisible]);

    return (
        <div className={`min-h-screen bg-canvas text-ink selection:bg-primary/20 transition-[padding] duration-500 ${railVisible ? "xl:pl-[17.5rem]" : ""}`}>
            {/* Global Mesh Gradient Background */}
            <div className="bg-mesh">
                <div className="mesh-orb w-[600px] h-[600px] bg-primary/[0.07] top-0 left-[-10%]"></div>
                <div className="mesh-orb w-[800px] h-[800px] bg-accent/[0.05] bottom-0 right-[-10%]"></div>
            </div>

            {/* Fixed report chrome — sticky fails under App's overflow-hidden root */}
            <header
                ref={headerRef}
                className={`fixed top-0 right-0 z-50 bg-surface/95 backdrop-blur-2xl shadow-[0_1px_0_rgb(var(--c-primary)/0.12),0_8px_24px_-16px_rgb(var(--c-primary)/0.25)] py-5 transition-[transform,opacity,left] duration-500 ${railVisible ? 'left-0 xl:left-[17.5rem]' : 'left-0'} ${isFocusMode ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}
            >
                {/* Brand underline: the blue-to-red gradient, used here as the
                    header's only rule so light mode reads crisp instead of pale. */}
                <div
                    className="absolute inset-x-0 bottom-0 h-px pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, rgb(var(--c-primary)), rgb(var(--c-accent)) 55%, transparent)' }}
                />
                <div className="max-w-[1600px] mx-auto px-8 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => navigate('/surveys')}
                            className="w-11 h-11 grid place-items-center bg-surface border border-primary/20 rounded-2xl hover:border-primary/50 hover:bg-primary/[0.06] hover:text-primary-soft transition-all text-ink-muted group"
                            title="Back to Dashboard"
                        >
                            <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div
                            className="p-3 rounded-2xl shadow-lg shadow-primary/25"
                            style={{ background: 'linear-gradient(135deg, rgb(var(--c-primary)), rgb(var(--c-accent)))' }}
                        >
                            <Activity className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black font-display tracking-tight text-ink">
                                {report.project_name || 'Strategic Analysis'}
                            </h1>
                            <div className="flex gap-2 mt-1 flex-wrap">
                                {(report.brands || report.brand_list)?.slice(0, 5).map((b: string, i: number) => (
                                    <span key={`${b}-${i}`} className="text-[10px] font-black uppercase tracking-widest text-ink-muted bg-surface-sunken px-2 py-0.5 rounded border border-primary/15 dark:border-line/10">
                                        {b}
                                    </span>
                                ))}
                                {hasNewPipeline && (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary-soft bg-primary/10 px-2 py-0.5 rounded border border-primary/25">
                                        V2 • {charts.length} Charts
                                    </span>
                                )}
                                {report?.telemetry?.document_cache_hit && (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-accent-soft bg-accent/10 px-2 py-0.5 rounded border border-accent/25 flex items-center gap-1">
                                        <Database className="w-2.5 h-2.5" />
                                        Neural Cache
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <FilterPanel
                            availableFilters={report?.available_filters || {}}
                            brands={report?.brands || report?.brand_list || []}
                            activeFilters={activeFilters}
                            onChange={setActiveFilters}
                            onApply={handleApplySlice}
                            isApplying={isSlicing}
                        />
                        {/* Focus mode — temporarily hidden from the top bar
                        <button onClick={toggleFocusMode} className="p-3 bg-primary/10 dark:bg-primary/20 text-primary-soft border border-primary/20 dark:border-primary/30 rounded-2xl hover:bg-primary hover:text-white transition-all shadow-sm" title="Enter Focus Mode">
                            <Maximize className="h-5 w-5" />
                        </button>
                        */}
                        <button
                            onClick={toggleTheme}
                            className="p-3 bg-surface border border-line/80 dark:border-line/10 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-ink-muted group relative overflow-hidden active:scale-90"
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
                        <button onClick={() => handleGenerate(true)} className="w-11 h-11 grid place-items-center bg-surface border border-primary/20 rounded-2xl hover:border-primary/50 hover:bg-primary/[0.06] transition-all text-ink-muted hover:text-primary-soft" title="Regenerate">
                            <RefreshCw className="h-5 w-5" />
                        </button>
                        {/* AI cost dashboard — temporarily hidden from the top bar
                        {localStorage.getItem('role') === 'admin' && (
                            <button
                                onClick={handleViewAICosts}
                                className="w-11 h-11 grid place-items-center bg-surface border border-primary/20 rounded-2xl hover:border-primary/50 hover:bg-primary/[0.06] transition-all text-ink-muted hover:text-primary-soft group relative"
                                title="View AI Costs"
                            >
                                <Database className="h-5 w-5" />
                                {isLoadingCosts && (
                                    <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                )}
                            </button>
                        )}
                        */}
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

            {/* Reserve vertical space so the fixed header does not cover content */}
            {!isFocusMode && <div aria-hidden style={{ height: headerHeight }} />}

            {/* Immersive Focus Mode Overlay (Slide Presentation Engine) */}
            {isFocusMode && (
                <div className="fixed inset-0 z-[100] bg-surface p-4 md:p-8 overflow-hidden flex flex-col animate-fade-in focus-mode-overlay">
                    <div className="flex justify-between items-center mb-4 md:mb-6 shrink-0">
                        <div className="flex items-center gap-4 md:gap-6 min-w-0">
                            <div className="p-3 md:p-4 bg-primary/10 rounded-2xl border border-primary/20 shrink-0">
                                <Activity className="h-6 w-6 md:h-8 md:w-8 text-primary-soft" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xl md:text-3xl font-black uppercase tracking-tight italic text-ink leading-tight truncate">
                                    {report.project_name}
                                </h2>
                                <div className="flex items-center gap-3 mt-1">
                                    <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-[0.3em]">Strategic Immersion Engine</p>
                                    <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 md:gap-4 shrink-0">
                            <div className="flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-surface-sunken rounded-2xl border border-line/80 dark:border-line/10">
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Slide</span>
                                <span className="text-primary-soft font-black font-mono text-lg">{Math.min(activeGroupIndex, Math.max(groupNames.length - 1, 0)) + 1}</span>
                                <span className="text-slate-600 font-bold mx-1">/</span>
                                <span className="text-slate-500 font-bold font-mono">{groupNames.length}</span>
                            </div>
                            <button
                                onClick={toggleTheme}
                                className="p-3 md:p-4 bg-surface-sunken border border-line/80 dark:border-line/10 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-all text-ink-muted relative overflow-hidden active:scale-95"
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
                                className="p-3 md:p-4 bg-surface-sunken border border-line/80 dark:border-line/10 rounded-3xl hover:bg-rose-500/10 hover:text-rose-500 transition-all text-slate-400"
                                title="Exit Focus Mode"
                            >
                                <X className="h-7 w-7 md:h-8 md:w-8" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 flex items-stretch gap-3 md:gap-6 relative">
                        {/* Slide Navigation: Previous */}
                        <button
                            disabled={activeGroupIndex <= 0}
                            onClick={() => setActiveGroupIndex((prev: number) => Math.max(0, prev - 1))}
                            className={`self-center p-4 md:p-5 rounded-full border bg-surface shadow-xl transition-all z-20 shrink-0 ${activeGroupIndex <= 0 ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-70 hover:opacity-100 active:scale-90 border-line/80 dark:border-line/10 text-slate-400 hover:text-primary-soft hover:border-primary/30'}`}
                            title="Previous slide"
                            aria-label="Previous slide"
                        >
                            <ChevronLeft className="h-8 w-8 md:h-10 md:w-10" />
                        </button>

                        <div className="flex-1 h-full min-h-0 min-w-0 relative">
                            {focusCharts && focusGroupName ? (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={focusGroupName}
                                        initial={{ opacity: 0, x: 40 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -40 }}
                                        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                                        className="absolute inset-0 flex flex-col"
                                    >
                                        <div className="flex items-center gap-4 md:gap-6 mb-3 md:mb-4 shrink-0">
                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-brand-blue/20 to-transparent" />
                                            <h3 className={`text-2xl md:text-4xl font-black uppercase tracking-tighter italic truncate max-w-[70vw] ${isDark ? 'text-white' : 'text-slate-900'}`}>{focusGroupName}</h3>
                                            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-brand-blue/20 to-transparent" />
                                        </div>
                                        <div className="flex-1 min-h-0">
                                            <TabbedChartGroup
                                                groupName={focusGroupName}
                                                charts={focusCharts}
                                                isFocusMode={true}
                                            />
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            ) : (
                                <div className="h-full grid place-items-center text-ink-subtle font-bold uppercase tracking-widest text-sm">
                                    No chart groups available
                                </div>
                            )}
                        </div>

                        {/* Slide Navigation: Next */}
                        <button
                            disabled={activeGroupIndex >= groupNames.length - 1}
                            onClick={() => setActiveGroupIndex((prev: number) => Math.min(groupNames.length - 1, prev + 1))}
                            className={`self-center p-4 md:p-5 rounded-full border bg-surface shadow-xl transition-all z-20 shrink-0 ${activeGroupIndex >= groupNames.length - 1 ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-70 hover:opacity-100 active:scale-90 border-line/80 dark:border-line/10 text-slate-400 hover:text-primary-soft hover:border-primary/30'}`}
                            title="Next slide"
                            aria-label="Next slide"
                        >
                            <ChevronRight className="h-8 w-8 md:h-10 md:w-10" />
                        </button>
                    </div>

                    <div className="mt-4 md:mt-6 shrink-0 flex justify-center gap-2.5">
                        {groupNames.map((_: any, idx: number) => (
                            <button
                                key={`nav-dot-${idx}`}
                                onClick={() => setActiveGroupIndex(idx)}
                                className={`h-1.5 rounded-full transition-all duration-500 ${idx === activeGroupIndex ? 'w-12 bg-primary shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'w-3 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20'}`}
                                aria-label={`Go to slide ${idx + 1}`}
                            />
                        ))}
                    </div>
                </div>
            )}

            <main className="max-w-[1600px] mx-auto px-8 py-10 flex items-start relative">
                {/* ── Report rail ──
                    Anchored to the viewport edge and full height, matching the
                    app-wide navigation rail rather than floating as a card. */}
                <aside
                    className={`fixed left-0 top-0 bottom-0 w-[17.5rem] brand-rail z-50 hidden xl:flex flex-col transition-transform duration-500 ${railVisible ? 'translate-x-0' : 'xl:-translate-x-full pointer-events-none'}`}
                >
                    {railVisible && (
                        <button
                            type="button"
                            onClick={() => setRailOpen(false)}
                            className="absolute top-8 -right-3 z-30 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-white/20 dark:border-slate-600 shadow-lg shadow-black/25 flex items-center justify-center text-primary hover:scale-110 hover:bg-primary hover:text-white hover:border-primary active:scale-95 transition-all"
                            title="Collapse sidebar"
                            aria-label="Collapse sidebar"
                        >
                            <ChevronLeft size={14} strokeWidth={2.5} />
                        </button>
                    )}
                    {/* Brand head — same mark and wording as the main rail */}
                    <div className="relative px-5 py-6 border-b border-white/[0.07] shrink-0 overflow-hidden">
                        <div
                            className="absolute -top-12 -right-10 w-32 h-32 rounded-full blur-2xl opacity-40 pointer-events-none"
                            style={{ background: 'rgb(var(--c-accent))' }}
                        />
                        <button
                            onClick={() => navigate('/dashboard')}
                            title="Dashboard"
                            className="relative flex items-center gap-3 w-full text-left group/logo"
                        >
                            {/* White plate: the logo artwork is the same navy as
                                the rail and would otherwise disappear. */}
                            <div className="bg-white rounded-2xl px-4 py-3 shadow-lg shadow-black/25 shrink-0 transition-transform duration-500 group-hover/logo:scale-[1.03]">
                                <img
                                    src="/brand/logo-full.png"
                                    alt="Marketeers"
                                    className="h-[3.25rem] w-auto max-w-[10.5rem] object-contain"
                                />
                            </div>
                        </button>

                        <div className="relative mt-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/55 leading-none mb-1.5">
                                Decision Support
                            </div>
                            <div className="text-[13px] font-bold text-white leading-snug line-clamp-2">
                                {report.project_name || 'Analytics Report'}
                            </div>
                        </div>

                        {/* Sample size + brand count under survey name — temporarily hidden
                        {report.base_n > 0 && (
                            <div className="relative mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-white/50">
                                <Database className="w-2.5 h-2.5 shrink-0" />
                                <span>N={report.base_n}</span>
                                <span className="text-white/20">·</span>
                                <span>{(report.brands || report.brand_list)?.length || 0} brands</span>
                            </div>
                        )}
                        */}
                    </div>

                    {/* Section navigation */}
                    {/* Scroll region: the section list can outgrow the viewport,
                        so it scrolls independently of the pinned head and foot. */}
                    <div className="relative flex-1 min-h-0">
                        {/* Fade affordances so a mid-scroll list reads as scrollable */}
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 z-10 bg-gradient-to-b from-[rgb(var(--c-chrome))] to-transparent" />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 z-10 bg-gradient-to-t from-[rgb(var(--c-chrome-deep))] to-transparent" />

                        <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-none px-3 py-4">
                        <div className="px-3 pb-2.5 text-[9px] font-black uppercase tracking-[0.3em] text-white/35">
                            Architecture
                        </div>
                        <nav>
                            <ul className="space-y-0.5">
                                <li>
                                    <a
                                        href="#summary"
                                        data-active={activeSectionId === 'summary'}
                                        className="nav-item"
                                    >
                                        <span className="shrink-0 w-8 h-8 rounded-lg bg-white/10 grid place-items-center">
                                            <Activity className="w-4 h-4" />
                                        </span>
                                        <span className="text-[12.5px] uppercase tracking-[0.06em] truncate">Overview</span>
                                    </a>
                                </li>

                                {report?.insights?.market_position_report && (
                                    <li>
                                        <a
                                            href="#strategic-positioning"
                                            data-active={activeSectionId === 'strategic-positioning'}
                                            className="nav-item"
                                        >
                                            <span className="shrink-0 w-8 h-8 rounded-lg bg-accent/25 grid place-items-center">
                                                <Sparkles className="w-4 h-4" />
                                            </span>
                                            <span className="text-[12.5px] uppercase tracking-[0.06em] truncate">Strategic</span>
                                        </a>
                                    </li>
                                )}

                                <li className="py-2 px-3">
                                    <div className="h-px bg-white/10" />
                                </li>

                                {hasNewPipeline ? (
                                    groupNames.map((group: string, i: number) => {
                                        const id = `group-${i}`;
                                        const count = chartGroups[group]?.length || 0;
                                        const active = activeSectionId === id;
                                        return (
                                            <li key={group}>
                                                <a href={`#${id}`} data-active={active} className="nav-item">
                                                    {/* Sequential order number — the badge on the
                                                        right is the chart count, kept visually
                                                        distinct so the two are never confused. */}
                                                    <span className={`shrink-0 w-8 h-8 rounded-lg grid place-items-center text-[11px] font-black tabular-nums transition-colors ${active ? 'bg-white/20 text-white' : 'bg-white/[0.07] text-white/50'}`}>
                                                        {String(i + 1).padStart(2, '0')}
                                                    </span>
                                                    <span className="text-[12.5px] uppercase tracking-[0.06em] leading-tight truncate flex-1">
                                                        {group}
                                                    </span>
                                                    {count > 0 && (
                                                        <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-white/10 text-[10px] font-bold text-white/60 tabular-nums grid place-items-center">
                                                            {count}
                                                        </span>
                                                    )}
                                                </a>
                                            </li>
                                        );
                                    })
                                ) : (
                                    report.sections?.map((section: any, i: number) => (
                                        <li key={i}>
                                            <a
                                                href={`#section-${i}`}
                                                data-active={activeSectionId === `section-${i}`}
                                                className="nav-item"
                                            >
                                                <span className="shrink-0 w-8 h-8 rounded-lg bg-white/[0.07] grid place-items-center text-[11px] font-black text-white/50 tabular-nums">
                                                    {String(i + 1).padStart(2, '0')}
                                                </span>
                                                <span className="text-[12.5px] uppercase tracking-[0.06em] leading-tight truncate">
                                                    {section.section_name}
                                                </span>
                                            </a>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </nav>
                        </div>
                    </div>

                    {/* Platform navigation, collapsed into one group so it does
                        not compete with the report's own section list. */}
                    <div className="shrink-0 px-3 pt-3 border-t border-white/[0.07]">
                        <button
                            onClick={() => setGoToOpen((v) => !v)}
                            className="nav-item w-full"
                            aria-expanded={goToOpen}
                        >
                            <span className="shrink-0 w-8 h-8 rounded-lg bg-white/[0.07] grid place-items-center">
                                <LayoutDashboard className="w-4 h-4" />
                            </span>
                            <span className="text-[12.5px] uppercase tracking-[0.06em] truncate flex-1 text-left">
                                Go to
                            </span>
                            <motion.span animate={{ rotate: goToOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                <ChevronDown className="w-4 h-4 text-white/45" />
                            </motion.span>
                        </button>

                        <AnimatePresence initial={false}>
                            {goToOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="pl-5 pr-1 py-1 space-y-0.5 border-l border-white/10 ml-[22px]">
                                        {[
                                            { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
                                            { label: 'Surveys', icon: ClipboardList, to: '/surveys' },
                                            { label: 'Reports', icon: FileText, to: '/surveys/reports' },
                                        ].map((item) => (
                                            <button
                                                key={item.to}
                                                onClick={() => navigate(item.to)}
                                                className="nav-item w-full"
                                            >
                                                <span className="shrink-0 w-7 h-7 rounded-lg bg-white/[0.07] grid place-items-center">
                                                    <item.icon className="w-3.5 h-3.5" />
                                                </span>
                                                <span className="text-[12px] uppercase tracking-[0.06em] truncate">
                                                    {item.label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Sample size footer — temporarily hidden
                    {report.base_n > 0 && (
                        <div className="shrink-0 px-5 py-4 border-t border-white/[0.07]">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.25em]">
                                    Sample
                                </span>
                                <Database className="w-3 h-3 text-white/40" />
                            </div>
                            <div className="text-2xl font-black font-display text-white leading-none mb-2.5">
                                N={report.base_n}
                            </div>
                            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: '100%' }}
                                    transition={{ duration: 1.4, ease: 'easeOut' }}
                                    className="h-full rounded-full"
                                    style={{
                                        background:
                                            'linear-gradient(90deg, rgb(var(--c-primary)), rgb(var(--c-accent)))',
                                    }}
                                />
                            </div>
                        </div>
                    )}
                    */}
                </aside>

                {/* Main Content - Padded to avoid overlap */}
                <div className={`flex-1 min-w-0 space-y-16 pb-24 transition-all duration-500`}>
                    {/* Executive Summary Section */}
                    <section id="summary" className="scroll-mt-40 animate-fade-in">
                        <div className="flex items-center gap-4 mb-6">
                            <div
                                className="h-1 w-12 rounded-full"
                                style={{ background: 'linear-gradient(90deg, rgb(var(--c-primary)), rgb(var(--c-accent)))' }}
                            />
                            <h2 className="text-xl font-black uppercase tracking-[0.25em] text-ink-subtle">Business Objective</h2>
                        </div>
                        {surveyId && <ProductTestAnalyticsStrip surveyId={surveyId} />}
                        {/* Report vitals, read off the existing payload */}
                        <div className="mb-8">
                            <ReportKpiRow report={report} />
                        </div>
                        {report.insights && (
                            <ExecutiveSummary
                                summary={report.insights.executive_summary}
                                findings={report.insights.key_findings}
                                opportunity_insights={report.insights.opportunity_insights}
                                report={report}
                                surveyId={surveyId}
                                editable={['admin', 'analyst'].includes(localStorage.getItem('role') || '')}
                            />
                        )}
                    </section>

                    {/* Strategic Command Center - Integrated AI Layer */}
                    {report.insights?.market_position_report && (
                        <section id="strategic-positioning" className="scroll-mt-40 animate-slide-up">
                            <div className="flex items-center gap-4 mb-12">
                                <div className="h-1 w-12 bg-primary rounded-full"></div>
                                <h2 className="text-3xl font-black uppercase tracking-widest italic text-primary-soft">Strategic Intelligence</h2>
                            </div>
                            <MarketPositionSection
                                data={report.insights.market_position_report}
                                strategicCharts={strategicCharts}
                            />
                        </section>
                    )}

                    {hasNewPipeline ? (
                        groupNames.map((group: string, gIdx: number) => (
                            <section key={group} id={`group-${gIdx}`} className="scroll-mt-40 space-y-4 animate-slide-up" style={{ animationDelay: `${gIdx * 0.1}s` }}>
                                <div className="flex items-center justify-between border-b border-line/80 dark:border-line/10 pb-4">
                                    <div className="space-y-1">
                                        <div className="text-xs font-black text-primary-soft uppercase tracking-[0.4em]">Section — {String(gIdx + 1).padStart(2, '0')}</div>
                                        <h3 className="text-3xl font-black font-display tracking-tight text-ink">{group}</h3>
                                    </div>
                                    <div className="px-6 py-2 bg-primary/10 border border-primary/20 rounded-full text-primary-soft text-xs font-black uppercase tracking-widest">
                                        {chartGroups[group].length} {chartGroups[group].length === 1 ? 'Visualization' : 'Visualizations'}
                                    </div>
                                </div>

                                <TabbedChartGroup groupName={group} charts={chartGroups[group]} isFocusMode={false} />
                            </section>
                        ))
                    ) : (
                        report.sections?.map((section: any, idx: number) => (
                            <section key={idx} id={`section-${idx}`} className="scroll-mt-40 space-y-16 animate-slide-up" style={{ animationDelay: `${idx * 0.1}s` }}>
                                <div className="flex items-center justify-between border-b border-line/80 dark:border-line/10 pb-8">
                                    <div className="space-y-2">
                                        <div className="text-xs font-black text-primary-soft uppercase tracking-[0.4em]">Section — {String(idx + 1).padStart(2, '0')}</div>
                                        <h3 className="text-3xl font-black font-display tracking-tight text-ink">{section.section_name}</h3>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-12">
                                    {section.charts?.map((chart: any, cIdx: number) => (
                                        <div key={cIdx} className="hover:scale-[1.01] transition-transform duration-500">
                                            <ChartRenderer chart={chart} isFocusMode={false} />
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

            {/* ── Floating controls ── */}
            {!isFocusMode && (
                <>
                    {/* Re-open the rail once it has been collapsed */}
                    {!railOpen && (
                        <button
                            onClick={() => setRailOpen(true)}
                            title="Show sidebar"
                            aria-label="Show sidebar"
                            className="hidden xl:grid fixed left-5 top-28 z-50 w-11 h-11 place-items-center rounded-2xl text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
                            style={{ background: 'linear-gradient(135deg, rgb(var(--c-primary)), rgb(var(--c-accent)))' }}
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    )}

                    {/* Back to top */}
                    <AnimatePresence>
                        {showToTop && (
                            <motion.button
                                initial={{ opacity: 0, y: 16, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 16, scale: 0.9 }}
                                transition={{ duration: 0.2 }}
                                onClick={scrollToTop}
                                title="Back to top"
                                aria-label="Back to top"
                                className="fixed right-6 bottom-6 z-50 flex items-center gap-2 pl-4 pr-5 py-3 rounded-full text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/30 hover:-translate-y-0.5 active:scale-95 transition-transform"
                                style={{ background: 'linear-gradient(135deg, rgb(var(--c-primary)), rgb(var(--c-accent)))' }}
                            >
                                <ArrowUp className="w-4 h-4" />
                                Top
                            </motion.button>
                        )}
                    </AnimatePresence>
                </>
            )}

            {/* Scroll Progress Bar */}
            <div className="fixed bottom-0 left-0 w-full h-1.5 bg-slate-200 dark:bg-slate-900 z-50">
                <div className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-300"
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
