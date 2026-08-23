import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Download,
    Monitor,
    CheckCircle2,
    Layout,
    Loader2,
    AlertCircle,
    Info,
    RefreshCw,
    Ban,
    Clock,
    WifiOff,
    Gauge,
} from 'lucide-react';
import { analytics as api_analytics, type ReportPptxStatus } from '../../services/api';
import { useReportStatusPoll } from '../../hooks/useReportStatusPoll';
import { fetchReportStatusOnce } from '../../utils/reportStatusPollHub';
import {
    EXPORT_PROFILE,
    buildPptxProgressSnapshot,
    canCloseModalDuringExport,
    formatPptxExportFailure,
    getPptxDegradedPresentation,
    getPptxStagePresentation,
    mergePptxProgress,
    resolvePptxDegradedState,
    shouldShowCancelExport,
    type PptxDegradedState,
    type PptxFailurePresentation,
    type PptxProgressSnapshot,
    type PptxStagePresentation,
} from './pptxExportUx';

type ExportStatus = 'idle' | 'processing' | 'ready' | 'failed' | 'downloading';

interface ExportConfigModalProps {
    isOpen: boolean;
    surveyId: string;
    hasPptx?: boolean;
    onClose: () => void;
    onExportReady?: () => Promise<void> | void;
}

const PROGRESS_RING_CIRCUMFERENCE = 377;

const DEGRADED_TONE_CLASS: Record<string, string> = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    red: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
    blue: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100',
    slate: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200',
};

function DegradedBanner({ state }: { state: PptxDegradedState }) {
    const presentation = getPptxDegradedPresentation(state);
    if (!presentation) {
        return null;
    }

    const Icon =
        state === 'rate_limited'
            ? Gauge
            : state === 'connection_unstable'
                ? WifiOff
                : state === 'interrupted' || state === 'stale'
                    ? AlertCircle
                    : Clock;

    return (
        <div
            className={`w-full max-w-lg rounded-2xl border px-4 py-3 flex items-start gap-3 ${DEGRADED_TONE_CLASS[presentation.tone]}`}
            role="status"
        >
            <Icon size={18} className="shrink-0 mt-0.5" />
            <div className="text-left">
                <p className="text-sm font-black">{presentation.title}</p>
                <p className="text-xs font-bold mt-1 opacity-90">{presentation.detail}</p>
            </div>
        </div>
    );
}

function ProgressStatsRow({ snapshot }: { snapshot: PptxProgressSnapshot }) {
    if (!snapshot.elapsedLabel && !snapshot.chartLine && !snapshot.stageDetail) {
        return null;
    }

    return (
        <div className="w-full max-w-md space-y-2 rounded-2xl border border-line/80 dark:border-line/10 bg-white/80 dark:bg-slate-900/60 px-4 py-3">
            {snapshot.elapsedLabel ? (
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Clock size={12} />
                    Elapsed {snapshot.elapsedLabel}
                    {snapshot.idleSeconds != null && snapshot.idleSeconds > 0 ? (
                        <span className="normal-case tracking-normal text-slate-500">
                            · idle {Math.round(snapshot.idleSeconds)}s
                        </span>
                    ) : null}
                </p>
            ) : null}
            {snapshot.chartLine ? (
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{snapshot.chartLine}</p>
            ) : null}
            {snapshot.stageDetail ? (
                <p className="text-xs font-bold text-ink-muted">{snapshot.stageDetail}</p>
            ) : null}
        </div>
    );
}

export default function ExportConfigModal({
    isOpen,
    surveyId,
    hasPptx = false,
    onClose,
    onExportReady,
}: ExportConfigModalProps) {
    const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [stagePresentation, setStagePresentation] = useState<PptxStagePresentation>(
        getPptxStagePresentation('preparing'),
    );
    const [failurePresentation, setFailurePresentation] = useState<PptxFailurePresentation | null>(null);
    const [progressSnapshot, setProgressSnapshot] = useState<PptxProgressSnapshot>(
        buildPptxProgressSnapshot({ survey_id: surveyId }),
    );
    const [lastStatus, setLastStatus] = useState<ReportPptxStatus | null>(null);
    const [degradedState, setDegradedState] = useState<PptxDegradedState>('none');
    const [rateLimited, setRateLimited] = useState(false);
    const [pollErrorCount, setPollErrorCount] = useState(0);
    const [cancelPending, setCancelPending] = useState(false);
    const [retryPending, setRetryPending] = useState(false);

    const applyStatusData = useCallback(
        (statusData: ReportPptxStatus, signals?: { rateLimited?: boolean; pollErrors?: number }) => {
            setLastStatus(statusData);
            setProgress((current) => mergePptxProgress(current, statusData.pptx_progress));
            setStagePresentation(getPptxStagePresentation(statusData.pptx_stage, statusData));
            setProgressSnapshot(buildPptxProgressSnapshot(statusData));
            setDegradedState(
                resolvePptxDegradedState(statusData, {
                    rateLimited: signals?.rateLimited ?? rateLimited,
                    consecutivePollErrors: signals?.pollErrors ?? pollErrorCount,
                    connectionUnstable: (signals?.pollErrors ?? pollErrorCount) >= 3,
                }),
            );

            const pptx = String(statusData.pptx_status || '').toUpperCase();

            if (pptx === 'READY') {
                setProgress(100);
                setExportStatus('ready');
                setStagePresentation(getPptxStagePresentation('ready', statusData));
                setFailurePresentation(null);
                return;
            }

            if (pptx === 'FAILED') {
                setExportStatus('failed');
                setStagePresentation(getPptxStagePresentation('failed', statusData));
                setFailurePresentation(formatPptxExportFailure(statusData));
                return;
            }

            if (pptx === 'CANCELLED') {
                setExportStatus('failed');
                setStagePresentation(getPptxStagePresentation('cancelled', statusData));
                setFailurePresentation(formatPptxExportFailure(statusData));
                return;
            }

            if (pptx === 'PROCESSING' || pptx === 'QUEUED') {
                setExportStatus('processing');
                setFailurePresentation(null);
            }
        },
        [pollErrorCount, rateLimited],
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        let cancelled = false;

        const syncExportState = async () => {
            try {
                const statusData = await fetchReportStatusOnce(surveyId);
                if (cancelled) {
                    return;
                }
                applyStatusData(statusData);
                if (
                    statusData.pptx_status !== 'PROCESSING' &&
                    statusData.pptx_status !== 'QUEUED' &&
                    statusData.pptx_status !== 'READY' &&
                    statusData.pptx_status !== 'FAILED' &&
                    statusData.pptx_status !== 'CANCELLED'
                ) {
                    setExportStatus(hasPptx ? 'ready' : 'idle');
                    setProgress(hasPptx ? 100 : 0);
                }
            } catch {
                if (cancelled) {
                    return;
                }
                setExportStatus(hasPptx ? 'ready' : 'idle');
                setProgress(hasPptx ? 100 : 0);
            }
        };

        void syncExportState();

        return () => {
            cancelled = true;
        };
    }, [applyStatusData, hasPptx, isOpen, surveyId]);

    const handleStartExport = async (forceRetry = false) => {
        setExportStatus('processing');
        setProgress(5);
        setFailurePresentation(null);
        setRateLimited(false);
        setPollErrorCount(0);
        setDegradedState('none');
        setStagePresentation(getPptxStagePresentation('preparing'));

        try {
            await api_analytics.generatePptx(surveyId, { forceRetry });
            setProgress((current) => mergePptxProgress(current, 10));
        } catch (err: unknown) {
            const detail =
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                'Generation initialization failed.';
            setExportStatus('failed');
            setStagePresentation(getPptxStagePresentation('failed'));
            setFailurePresentation({
                headline: 'Export failed',
                summary: detail,
                stageLabel: 'Startup',
                reasons: [detail],
                warnings: [],
            });
        }
    };

    const handleCancelExport = async () => {
        setCancelPending(true);
        try {
            await api_analytics.cancelPptx(surveyId);
        } catch (err: unknown) {
            console.error('Cancel export failed:', err);
        } finally {
            setCancelPending(false);
        }
    };

    const handleDownload = async () => {
        try {
            setExportStatus('downloading');
            await api_analytics.downloadReport(surveyId);
            setExportStatus('ready');
            setStagePresentation(getPptxStagePresentation('ready'));
            onClose();
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setExportStatus('failed');
            setStagePresentation(getPptxStagePresentation('failed'));
            setFailurePresentation({
                headline: 'Download failed',
                summary:
                    status === 410
                        ? 'The file has expired or was removed from the server.'
                        : 'Download failed. Connection unstable.',
                stageLabel: 'Download',
                reasons: [
                    status === 410
                        ? 'The file has expired or was removed from the server.'
                        : 'Download failed. Connection unstable.',
                ],
                warnings: [],
            });
        }
    };

    useReportStatusPoll({
        surveyId,
        enabled: isOpen && exportStatus === 'processing',
        watch: 'pptx',
        onUpdate: (statusData) => applyStatusData(statusData),
        onHeartbeat: (statusData) => applyStatusData(statusData),
        onStale: (statusData) => {
            applyStatusData(statusData, { pollErrors: pollErrorCount, rateLimited });
            setDegradedState('stale');
        },
        onRateLimited: (retryAfterMs) => {
            setRateLimited(true);
            setDegradedState('rate_limited');
            window.setTimeout(() => setRateLimited(false), retryAfterMs);
        },
        onPollError: () => {
            setPollErrorCount((count) => {
                const next = count + 1;
                if (lastStatus) {
                    setDegradedState(
                        resolvePptxDegradedState(lastStatus, {
                            rateLimited,
                            consecutivePollErrors: next,
                            connectionUnstable: next >= 3,
                        }),
                    );
                }
                return next;
            });
        },
        onTerminal: async (statusData, reason) => {
            applyStatusData(statusData);
            if (reason === 'pptx_ready') {
                await onExportReady?.();
            }
        },
    });

    const canDismiss = canCloseModalDuringExport(exportStatus, degradedState);
    const isBusy = exportStatus === 'processing' && !canDismiss;
    const isDownloading = exportStatus === 'downloading';
    const showCancel = shouldShowCancelExport(exportStatus, lastStatus?.pptx_status);
    const showRetry =
        exportStatus === 'failed' ||
        degradedState === 'interrupted' ||
        degradedState === 'retry_available';
    const showDownloadExisting =
        hasPptx &&
        (exportStatus === 'failed' ||
            exportStatus === 'idle' ||
            (exportStatus === 'processing' && canDismiss));

    const headerTitle = useMemo(() => {
        if (exportStatus === 'processing') {
            return stagePresentation.title;
        }
        if (exportStatus === 'ready') {
            return 'Presentation ready';
        }
        if (exportStatus === 'failed') {
            return failurePresentation?.headline || 'Export failed';
        }
        return 'Export configuration';
    }, [exportStatus, failurePresentation?.headline, stagePresentation.title]);

    const headerDescription = useMemo(() => {
        if (exportStatus === 'processing') {
            return (
                progressSnapshot.stageDetail ||
                stagePresentation.detail
            );
        }
        if (exportStatus === 'ready') {
            return 'Download the latest generated executive report.';
        }
        if (exportStatus === 'failed') {
            return failurePresentation?.summary || 'The export job stopped before certification.';
        }
        return 'Review the fixed export profile, then start generation.';
    }, [
        exportStatus,
        failurePresentation?.summary,
        progressSnapshot.stageDetail,
        stagePresentation.detail,
    ]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => {
                            if (!isBusy && !isDownloading) {
                                onClose();
                            }
                        }}
                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl bg-surface rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden"
                    >
                        <motion.div
                            layout
                            className="p-8 border-b border-line/80 dark:border-line/10 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50"
                        >
                            <div>
                                <h3 className="text-2xl font-black text-ink flex items-center gap-3">
                                    <Layout className="text-primary-soft" />
                                    {headerTitle}
                                </h3>
                                <p className="text-slate-500 text-sm font-bold mt-1">
                                    {headerDescription}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                disabled={isBusy || isDownloading}
                                className="p-3 rounded-2xl hover:bg-white dark:hover:bg-slate-700 transition-all text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label="Close export dialog"
                            >
                                <X size={20} />
                            </button>
                        </motion.div>

                        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar relative">
                            {exportStatus === 'processing' ? (
                                <div className="py-8 flex flex-col items-center justify-center space-y-5">
                                    {degradedState !== 'none' ? (
                                        <DegradedBanner state={degradedState} />
                                    ) : null}

                                    <motion.div layout className="relative w-32 h-32">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle
                                                cx="64"
                                                cy="64"
                                                r="60"
                                                stroke="currentColor"
                                                strokeWidth="8"
                                                fill="transparent"
                                                className="text-slate-100 dark:text-slate-800"
                                            />
                                            <motion.circle
                                                cx="64"
                                                cy="64"
                                                r="60"
                                                stroke="#000080"
                                                strokeWidth="8"
                                                fill="transparent"
                                                strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
                                                animate={{
                                                    strokeDashoffset:
                                                        PROGRESS_RING_CIRCUMFERENCE
                                                        - (PROGRESS_RING_CIRCUMFERENCE * progress) / 100,
                                                }}
                                                className="text-primary-soft"
                                            />
                                        </svg>
                                        <motion.div layout className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-2xl font-black text-ink">
                                                {progress}%
                                            </span>
                                        </motion.div>
                                    </motion.div>

                                    <motion.div layout className="text-center space-y-2">
                                        <p className="font-black text-ink">
                                            {stagePresentation.title}
                                        </p>
                                        <p className="text-sm text-slate-500 font-bold max-w-md">
                                            {stagePresentation.detail}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                            {stagePresentation.footer}
                                        </p>
                                    </motion.div>

                                    <ProgressStatsRow snapshot={progressSnapshot} />

                                    {canDismiss ? (
                                        <p className="text-xs font-bold text-slate-400 text-center max-w-sm">
                                            You can close this dialog — the export continues on the server.
                                            Re-open to check progress or retry if it stalls.
                                        </p>
                                    ) : null}
                                </div>
                            ) : exportStatus === 'ready' ? (
                                <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center">
                                    <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-600">
                                        <CheckCircle2 size={48} />
                                    </div>
                                    <div>
                                        <p className="text-xl font-black text-ink">
                                            Presentation ready
                                        </p>
                                        <p className="text-slate-500 font-bold mt-2">
                                            Your 16:9 executive deck is packed and ready for download.
                                        </p>
                                    </div>
                                </div>
                            ) : exportStatus === 'failed' ? (
                                <div className="py-8 flex flex-col items-center justify-center space-y-5 text-center">
                                    <DegradedBanner
                                        state={
                                            degradedState === 'none' ? 'retry_available' : degradedState
                                        }
                                    />

                                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                                        <AlertCircle size={32} />
                                    </div>
                                    <div className="space-y-2 max-w-lg">
                                        <p className="font-black text-ink">
                                            {failurePresentation?.headline || 'Export failed'}
                                        </p>
                                        <p className="text-sm text-slate-500 font-bold">
                                            {failurePresentation?.summary}
                                        </p>
                                        {failurePresentation?.retryGuidance ? (
                                            <p className="text-xs font-bold text-primary-soft">
                                                {failurePresentation.retryGuidance}
                                            </p>
                                        ) : null}
                                        {failurePresentation?.stageLabel ? (
                                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
                                                Stage: {failurePresentation.stageLabel}
                                            </p>
                                        ) : null}
                                    </div>
                                    {failurePresentation?.reasons.length ? (
                                        <ul className="w-full max-w-lg text-left space-y-2 rounded-3xl border border-red-100 dark:border-red-500/20 bg-red-50/70 dark:bg-red-500/10 p-5">
                                            {failurePresentation.reasons.map((reason) => (
                                                <li
                                                    key={reason}
                                                    className="text-sm font-bold text-red-700 dark:text-red-300"
                                                >
                                                    {reason}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                            ) : (
                                <section className="space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                                        Export profile
                                    </label>
                                    <div className="rounded-3xl border border-line/80 dark:border-line/10 bg-surface-raised/50 p-6 space-y-4">
                                        <motion.div layout className="flex items-start gap-4">
                                            <motion.div layout className="p-3 rounded-2xl bg-primary/10 text-primary-soft">
                                                <Monitor size={20} />
                                            </motion.div>
                                            <div>
                                                <p className="font-black text-sm text-ink">
                                                    {EXPORT_PROFILE.templateLabel}
                                                </p>
                                                <p className="text-[11px] text-slate-500 font-bold mt-1">
                                                    {EXPORT_PROFILE.templateDetail}
                                                </p>
                                            </div>
                                        </motion.div>
                                        <motion.div layout className="flex items-start gap-4">
                                            <motion.div layout className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600">
                                                <CheckCircle2 size={20} />
                                            </motion.div>
                                            <motion.div layout>
                                                <p className="font-black text-sm text-ink">
                                                    {EXPORT_PROFILE.themeLabel}
                                                </p>
                                                <p className="text-[11px] text-slate-500 font-bold mt-1">
                                                    {EXPORT_PROFILE.themeDetail}
                                                </p>
                                            </motion.div>
                                        </motion.div>
                                        <motion.div layout className="flex items-start gap-3 rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-line/80 dark:border-line/10 p-4">
                                            <Info size={18} className="text-slate-400 mt-0.5 shrink-0" />
                                            <p className="text-[11px] text-slate-500 font-bold">
                                                {EXPORT_PROFILE.note} {EXPORT_PROFILE.rolloutNote}
                                            </p>
                                        </motion.div>
                                    </div>
                                </section>
                            )}
                        </div>

                        <motion.div
                            layout
                            className="p-8 border-t border-line/80 dark:border-line/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/50"
                        >
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="p-3 rounded-2xl bg-primary/10 text-primary-soft shrink-0">
                                    <Monitor size={20} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-black text-ink truncate">
                                        {exportStatus === 'ready'
                                            ? 'Artifact status: ready'
                                            : exportStatus === 'processing'
                                                ? stagePresentation.footer
                                                : 'Estimated build: about 45 seconds'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-bold">
                                        {exportStatus === 'processing' && stagePresentation.captureHeavy
                                            ? 'Capture-heavy export in progress'
                                            : 'Server-managed executive deck export'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                                {showDownloadExisting ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleDownload()}
                                        disabled={isDownloading}
                                        className="px-5 py-3 rounded-2xl font-black text-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-all flex items-center gap-2"
                                    >
                                        <Download size={16} />
                                        Download existing PPTX
                                    </button>
                                ) : null}

                                {showCancel ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleCancelExport()}
                                        disabled={cancelPending || isDownloading}
                                        className="px-5 py-3 rounded-2xl font-black text-sm border border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {cancelPending ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <Ban size={16} />
                                        )}
                                        Cancel export
                                    </button>
                                ) : null}

                                {showRetry ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRetryPending(true);
                                            void handleStartExport(true).finally(() => setRetryPending(false));
                                        }}
                                        disabled={retryPending || isDownloading}
                                        className="px-5 py-3 rounded-2xl font-black text-sm bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {retryPending ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <RefreshCw size={16} />
                                        )}
                                        Retry export
                                    </button>
                                ) : null}

                                {exportStatus === 'ready' || isDownloading ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleDownload()}
                                        disabled={isDownloading}
                                        className="px-8 py-4 bg-emerald-600 text-white rounded-3xl font-black shadow-lg shadow-emerald-600/20 hover:scale-105 transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50"
                                    >
                                        {isDownloading ? (
                                            <>
                                                <Loader2 size={20} className="animate-spin" />
                                                Downloading...
                                            </>
                                        ) : (
                                            <>
                                                <Download size={20} />
                                                Download now
                                            </>
                                        )}
                                    </button>
                                ) : exportStatus !== 'processing' && exportStatus !== 'failed' ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleStartExport(false)}
                                        className="px-8 py-4 bg-primary text-white rounded-3xl font-black shadow-lg shadow-primary/20 hover:scale-105 transition-all flex items-center gap-3 active:scale-95"
                                    >
                                        <Download size={20} className="animate-bounce" />
                                        Start export
                                    </button>
                                ) : null}
                            </div>
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
