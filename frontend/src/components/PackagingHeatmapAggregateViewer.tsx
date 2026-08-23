import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Loader2, RefreshCw } from 'lucide-react';
import { packagingHeatmap } from '../services/api';
import type {
    PackagingHeatmapIntent,
    PackagingImageSide,
} from '../types/productTest';
import {
    INTENT_COLORS,
    INTENT_LABELS,
    PACKAGING_HEATMAP_GRID_SIZE,
    aggregateForSideIntent,
    drawHeatmapOverlay,
    topHotspotQuadrant,
} from '../utils/packagingHeatmapAnalytics';

export interface PackagingHeatmapSummary {
    survey_id: string;
    packaging_heatmap_enabled: boolean;
    grid_size: number;
    images: Partial<Record<PackagingImageSide, { width: number; height: number }>>;
    aggregates: Array<{
        question_id: string;
        image_side: PackagingImageSide;
        intent: PackagingHeatmapIntent;
        bins: number[];
        total_clicks: number;
        response_count: number;
    }>;
    summary: {
        question_count: number;
        total_clicks: number;
        max_response_count: number;
    };
}

interface PackagingHeatmapAggregateViewerProps {
    surveyId: string;
}

type OverlayMode = 'density' | 'percent';

const SIDES: PackagingImageSide[] = ['front', 'back'];
const INTENTS: PackagingHeatmapIntent[] = ['attraction', 'dislikes', 'improve'];

export default function PackagingHeatmapAggregateViewer({ surveyId }: PackagingHeatmapAggregateViewerProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [summary, setSummary] = useState<PackagingHeatmapSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(false);
    const [side, setSide] = useState<PackagingImageSide>('front');
    const [intent, setIntent] = useState<PackagingHeatmapIntent>('attraction');
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('density');

    const loadSummary = useCallback(async () => {
        setLoading(true);
        try {
            const data = await packagingHeatmap.getSummary(surveyId);
            setSummary(data);
            if (!data.images?.back && side === 'back') {
                setSide('front');
            }
        } finally {
            setLoading(false);
        }
    }, [surveyId, side]);

    useEffect(() => {
        loadSummary();
    }, [loadSummary]);

    const hasBack = Boolean(summary?.images?.back);

    useEffect(() => {
        let revoked: string | null = null;
        let mounted = true;

        const loadImage = async () => {
            if (!summary?.images?.[side]) {
                setImageUrl(null);
                return;
            }
            setImageLoading(true);
            try {
                const blob = await packagingHeatmap.streamImage(surveyId, side);
                const url = URL.createObjectURL(blob);
                revoked = url;
                if (mounted) setImageUrl(url);
            } catch {
                if (mounted) setImageUrl(null);
            } finally {
                if (mounted) setImageLoading(false);
            }
        };

        loadImage();
        return () => {
            mounted = false;
            if (revoked) URL.revokeObjectURL(revoked);
        };
    }, [surveyId, side, summary?.images]);

    const activeAggregate = useMemo(() => {
        if (!summary) return null;
        return aggregateForSideIntent(summary.aggregates, side, intent);
    }, [summary, side, intent]);

    const hotspot = useMemo(() => {
        if (!activeAggregate) return null;
        return topHotspotQuadrant(activeAggregate.bins, summary?.grid_size ?? PACKAGING_HEATMAP_GRID_SIZE);
    }, [activeAggregate, summary?.grid_size]);

    const paintCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img || !img.complete || !activeAggregate) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const naturalW = img.naturalWidth || summary?.images?.[side]?.width || 800;
        const naturalH = img.naturalHeight || summary?.images?.[side]?.height || 600;
        canvas.width = naturalW;
        canvas.height = naturalH;

        ctx.clearRect(0, 0, naturalW, naturalH);
        ctx.drawImage(img, 0, 0, naturalW, naturalH);

        drawHeatmapOverlay(ctx, naturalW, naturalH, {
            bins: activeAggregate.bins,
            gridSize: summary?.grid_size ?? PACKAGING_HEATMAP_GRID_SIZE,
            intent,
            mode: overlayMode,
            responseCount: activeAggregate.response_count,
            blur: true,
        });
    }, [activeAggregate, intent, overlayMode, side, summary?.grid_size, summary?.images]);

    useEffect(() => {
        paintCanvas();
    }, [paintCanvas, imageUrl]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="animate-spin mr-2" size={18} />
                <span className="text-xs font-bold uppercase tracking-widest">Loading heatmap analytics…</span>
            </div>
        );
    }

    if (!summary?.packaging_heatmap_enabled) {
        return (
            <p className="text-xs font-bold text-slate-500 italic text-center py-8">
                Packaging heatmap is not enabled for this survey.
            </p>
        );
    }

    const totalResponses = summary.summary.max_response_count;
    const totalClicks = summary.summary.total_clicks;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                {SIDES.filter((s) => s === 'front' || hasBack).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                            side === s
                                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                                : 'bg-surface text-ink-muted border-slate-200 dark:border-slate-700'
                        }`}
                    >
                        {s === 'front' ? 'Front' : 'Back'}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {INTENTS.map((key) => {
                    const colors = INTENT_COLORS[key];
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setIntent(key)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                intent === key
                                    ? 'text-white border-transparent shadow-md'
                                    : 'bg-surface text-ink-muted border-slate-200 dark:border-slate-700'
                            }`}
                            style={
                                intent === key
                                    ? { backgroundColor: `rgb(${colors.rgb.join(',')})` }
                                    : undefined
                            }
                        >
                            {INTENT_LABELS[key]}
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-widest">
                <div className="px-4 py-2 rounded-xl bg-surface-raised border border-slate-200 dark:border-slate-700 text-ink-muted">
                    Responses: <span className="text-ink">{totalResponses}</span>
                </div>
                <div className="px-4 py-2 rounded-xl bg-surface-raised border border-slate-200 dark:border-slate-700 text-ink-muted">
                    Total clicks: <span className="text-ink">{totalClicks}</span>
                </div>
                <div className="px-4 py-2 rounded-xl bg-surface-raised border border-slate-200 dark:border-slate-700 text-ink-muted">
                    Top hotspot:{' '}
                    <span className="text-ink">
                        {hotspot?.label ?? '—'}
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Legend</span>
                {(['density', 'percent'] as OverlayMode[]).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => setOverlayMode(mode)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                            overlayMode === mode
                                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                : 'bg-surface text-slate-500 border-slate-200 dark:border-slate-700'
                        }`}
                    >
                        {mode === 'density' ? 'Click density' : '% respondents'}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={loadSummary}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary/40"
                >
                    <RefreshCw size={12} />
                    Refresh
                </button>
            </div>

            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-950/5 dark:bg-slate-900/40 overflow-hidden">
                {(imageLoading || !imageUrl) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 dark:bg-slate-900/80 z-10">
                        <Loader2 className="animate-spin text-slate-400" size={24} />
                    </div>
                )}
                <div className="flex justify-center p-4">
                    {imageUrl ? (
                        <>
                            <img
                                ref={imageRef}
                                src={imageUrl}
                                alt={`Packaging ${side}`}
                                className="hidden"
                                onLoad={paintCanvas}
                            />
                            <canvas
                                ref={canvasRef}
                                className="max-w-full h-auto rounded-xl shadow-lg"
                                style={{ maxHeight: 'min(70vh, 640px)' }}
                            />
                        </>
                    ) : (
                        <div className="py-16 text-center text-slate-500">
                            <Crosshair className="mx-auto mb-2 opacity-40" size={28} />
                            <p className="text-xs font-bold">No image available for this side.</p>
                        </div>
                    )}
                </div>
            </div>

            {activeAggregate && (
                <p className="text-[10px] font-bold text-slate-500 text-center">
                    {activeAggregate.total_clicks} clicks from {activeAggregate.response_count} respondent
                    {activeAggregate.response_count === 1 ? '' : 's'} · {INTENT_LABELS[intent]} · {side}
                </p>
            )}
        </div>
    );
}
