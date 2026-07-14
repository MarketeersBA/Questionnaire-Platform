import { useEffect, useState } from 'react';
import { Download, Film, Image as ImageIcon, Loader2 } from 'lucide-react';
import { productTestMedia } from '../services/api';
import type { ProductTestMediaAnswerReference } from '../types/productTestMediaAnswer';
import { isProductTestMediaAnswerReference } from '../utils/productTestMediaAnswer';
import { formatMediaFileSize } from '../utils/productTestMediaAnswer';

interface ProductTestTrialMediaReviewProps {
    surveyId: string;
    value: ProductTestMediaAnswerReference;
}

export function isProductTestTrialMediaAnswer(value: unknown): value is ProductTestMediaAnswerReference {
    return isProductTestMediaAnswerReference(value);
}

export default function ProductTestTrialMediaReview({
    surveyId,
    value,
}: ProductTestTrialMediaReviewProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let revoked: string | null = null;
        let mounted = true;

        const load = async () => {
            setLoading(true);
            try {
                const blob = await productTestMedia.streamAsset(surveyId, value.asset_id);
                const url = URL.createObjectURL(blob);
                revoked = url;
                if (mounted) setPreviewUrl(url);
            } catch {
                if (mounted) setPreviewUrl(null);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void load();
        return () => {
            mounted = false;
            if (revoked) URL.revokeObjectURL(revoked);
        };
    }, [surveyId, value.asset_id]);

    const handleDownload = async () => {
        try {
            const blob = await productTestMedia.downloadAsset(surveyId, value.asset_id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = value.filename || `trial_media_${value.asset_id}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch {
            // silent — parent toast optional
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-blue/10 text-brand-blue">
                    {value.media_type === 'video' ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                    {value.media_type}
                </span>
                <span>{formatMediaFileSize(value.size_bytes)}</span>
                {value.duration_seconds ? <span>{value.duration_seconds}s</span> : null}
                {value.filename ? <span className="truncate max-w-[12rem]">{value.filename}</span> : null}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading preview...
                </div>
            ) : previewUrl && value.media_type === 'image' ? (
                <img
                    src={previewUrl}
                    alt={value.filename || 'Trial media'}
                    className="max-h-56 rounded-xl border border-slate-200 dark:border-slate-800 object-contain bg-slate-50 dark:bg-slate-900"
                />
            ) : previewUrl && value.media_type === 'video' ? (
                <video
                    src={previewUrl}
                    controls
                    className="max-h-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-black w-full"
                />
            ) : (
                <p className="text-xs font-bold text-slate-400 italic">Preview unavailable</p>
            )}

            <button
                type="button"
                onClick={() => void handleDownload()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
                <Download className="w-3.5 h-3.5" />
                Download
            </button>
        </div>
    );
}
