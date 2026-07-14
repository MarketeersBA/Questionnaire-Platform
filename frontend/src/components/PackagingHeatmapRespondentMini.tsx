import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { packagingHeatmap } from '../services/api';
import type { PackagingHeatmapAnswer } from '../types/productTest';
import { INTENT_LABELS, drawClickMarkers } from '../utils/packagingHeatmapAnalytics';

interface PackagingHeatmapRespondentMiniProps {
    surveyId: string;
    answer: PackagingHeatmapAnswer;
}

export function isPackagingHeatmapAnswer(value: unknown): value is PackagingHeatmapAnswer {
    if (!value || typeof value !== 'object') return false;
    const obj = value as PackagingHeatmapAnswer;
    return (
        typeof obj.image_side === 'string' &&
        typeof obj.intent === 'string' &&
        Array.isArray(obj.clicks)
    );
}

export default function PackagingHeatmapRespondentMini({
    surveyId,
    answer,
}: PackagingHeatmapRespondentMiniProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let revoked: string | null = null;
        let mounted = true;

        const load = async () => {
            setLoading(true);
            try {
                const blob = await packagingHeatmap.streamImage(surveyId, answer.image_side);
                const url = URL.createObjectURL(blob);
                revoked = url;
                if (mounted) setImageUrl(url);
            } catch {
                if (mounted) setImageUrl(null);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        return () => {
            mounted = false;
            if (revoked) URL.revokeObjectURL(revoked);
        };
    }, [surveyId, answer.image_side]);

    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img || !img.complete) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = img.naturalWidth || answer.ref_width || 400;
        const h = img.naturalHeight || answer.ref_height || 300;
        canvas.width = w;
        canvas.height = h;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        drawClickMarkers(ctx, w, h, answer.clicks, answer.intent);
    }, [answer]);

    useEffect(() => {
        paint();
    }, [paint, imageUrl]);

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">{answer.image_side}</span>
                <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                    {INTENT_LABELS[answer.intent]}
                </span>
                <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                    {answer.clicks.length} click{answer.clicks.length === 1 ? '' : 's'}
                </span>
            </div>
            <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/70 dark:bg-slate-900/70">
                        <Loader2 className="animate-spin text-slate-400" size={18} />
                    </div>
                )}
                {imageUrl ? (
                    <>
                        <img
                            ref={imageRef}
                            src={imageUrl}
                            alt=""
                            className="hidden"
                            onLoad={paint}
                        />
                        <canvas ref={canvasRef} className="w-full max-h-64 object-contain" />
                    </>
                ) : (
                    <p className="text-xs font-bold text-slate-500 italic p-6 text-center">
                        Could not load packaging image.
                    </p>
                )}
            </div>
        </div>
    );
}
