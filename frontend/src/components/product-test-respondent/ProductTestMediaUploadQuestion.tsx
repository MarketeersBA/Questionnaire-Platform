import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Film, Loader2, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { publicApi } from '../../services/api';
import type { ProductTestMediaAnswerReference } from '../../types/productTestMediaAnswer';
import type { ProductTestRespondentQuestion } from '../../types/productTestRespondent';
import {
    classifyFileMediaType,
    formatMediaFileSize,
    isProductTestMediaAnswerReference,
    mapTrialMediaUploadError,
    resolveTrialMediaClientLimits,
    validateTrialMediaFile,
} from '../../utils/productTestMediaAnswer';
import { isTrialMediaRespondentUploadEnabled } from '../../utils/trialMediaRollout';

interface ProductTestMediaUploadQuestionProps {
    question: ProductTestRespondentQuestion;
    value: unknown;
    onChange: (next: ProductTestMediaAnswerReference | null) => void;
    language: 'en' | 'ar';
    publicToken?: string;
    pulseError?: boolean;
}

export default function ProductTestMediaUploadQuestion({
    question,
    value,
    onChange,
    language,
    publicToken,
    pulseError = false,
}: ProductTestMediaUploadQuestionProps) {
    const isArabic = language === 'ar';
    const respondentUploadEnabled = isTrialMediaRespondentUploadEnabled();
    const limits = useMemo(() => resolveTrialMediaClientLimits(question), [question]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const localPreviewRef = useRef<string | null>(null);

    const savedRef = isProductTestMediaAnswerReference(value) ? value : null;

    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
    const [localPreviewMediaType, setLocalPreviewMediaType] = useState<'image' | 'video' | null>(null);

    const acceptAttr = useMemo(() => {
        if (limits.acceptedMedia === 'image') return 'image/jpeg,image/png,image/webp';
        if (limits.acceptedMedia === 'video') return 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
        return 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
    }, [limits.acceptedMedia]);

    const remotePreviewUrl = useMemo(() => {
        if (!publicToken || !savedRef?.asset_id) return null;
        return publicApi.trialMediaStreamUrl(publicToken, savedRef.asset_id);
    }, [publicToken, savedRef?.asset_id]);

    const revokeLocalPreview = useCallback(() => {
        if (localPreviewRef.current) {
            URL.revokeObjectURL(localPreviewRef.current);
            localPreviewRef.current = null;
        }
        setLocalPreviewUrl(null);
        setLocalPreviewMediaType(null);
    }, []);

    useEffect(() => () => {
        abortRef.current?.abort();
        revokeLocalPreview();
    }, [revokeLocalPreview]);

    const cancelUpload = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsUploading(false);
        setUploadProgress(0);
        setErrorMessage(isArabic ? 'تم إلغاء الرفع.' : 'Upload cancelled.');
    };

    const uploadFile = async (file: File) => {
        if (!publicToken) {
            setErrorMessage(isArabic ? 'رمز الاستبيان غير متاح.' : 'Survey token unavailable.');
            return;
        }

        const clientError = validateTrialMediaFile(file, limits, language);
        if (clientError) {
            setErrorMessage(clientError);
            return;
        }

        revokeLocalPreview();
        const objectUrl = URL.createObjectURL(file);
        localPreviewRef.current = objectUrl;
        setLocalPreviewUrl(objectUrl);
        setLocalPreviewMediaType(classifyFileMediaType(file));

        setErrorMessage(null);
        setIsUploading(true);
        setUploadProgress(0);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            if (savedRef?.asset_id) {
                await publicApi.deleteTrialMedia(publicToken, savedRef.asset_id, { signal: controller.signal });
            }

            const asset = await publicApi.uploadTrialMedia(
                publicToken,
                question.id,
                file,
                {
                    signal: controller.signal,
                    onProgress: setUploadProgress,
                },
            );

            onChange(asset as ProductTestMediaAnswerReference);
            toast.success(isArabic ? 'تم رفع الملف بنجاح' : 'Upload successful');
        } catch (err) {
            if (controller.signal.aborted) return;
            const message = mapTrialMediaUploadError(err, language);
            setErrorMessage(message);
            toast.error(message);
        } finally {
            abortRef.current = null;
            setIsUploading(false);
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void uploadFile(file);
    };

    const handleRemove = async () => {
        if (!publicToken || !savedRef?.asset_id) {
            onChange(null);
            revokeLocalPreview();
            setErrorMessage(null);
            return;
        }

        setIsUploading(true);
        setErrorMessage(null);
        try {
            await publicApi.deleteTrialMedia(publicToken, savedRef.asset_id);
            onChange(null);
            revokeLocalPreview();
            toast.success(isArabic ? 'تم حذف الملف' : 'Media removed');
        } catch (err) {
            const message = mapTrialMediaUploadError(err, language);
            setErrorMessage(message);
            toast.error(message);
        } finally {
            setIsUploading(false);
        }
    };

    const previewUrl = remotePreviewUrl || localPreviewUrl;
    const previewMediaType = savedRef?.media_type || localPreviewMediaType;
    const showImagePreview = previewUrl && previewMediaType === 'image';
    const showVideoPreview = previewUrl && previewMediaType === 'video';

    const hintText = (() => {
        const parts: string[] = [];
        if (limits.acceptedMedia === 'image_or_video') {
            parts.push(isArabic ? 'صورة أو فيديو' : 'Image or video');
        } else if (limits.acceptedMedia === 'image') {
            parts.push(isArabic ? 'صورة فقط' : 'Image only');
        } else {
            parts.push(isArabic ? 'فيديو فقط' : 'Video only');
        }
        parts.push(
            isArabic
                ? `حد الفيديو ${limits.maxVideoDurationSeconds} ث`
                : `${limits.maxVideoDurationSeconds}s video max`,
        );
        return parts.join(' · ');
    })();

    return (
        <div className={`space-y-4 ${pulseError ? 'ring-2 ring-rose-400 rounded-2xl p-2' : ''}`}>
            {!respondentUploadEnabled && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-700 dark:text-amber-300">
                    {isArabic
                        ? 'رفع الوسائط غير متاح حالياً في بيئة الاستبيان هذه.'
                        : 'Media upload is not enabled on this survey environment yet.'}
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept={acceptAttr}
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading || !publicToken || !respondentUploadEnabled}
            />

            {!savedRef && !isUploading && (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!publicToken || !respondentUploadEnabled}
                    className="w-full flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 hover:border-primary/40 hover:bg-primary/[0.03] transition-all"
                >
                    <div className="flex items-center gap-2 text-primary-soft">
                        {limits.acceptedMedia === 'video' ? <Film className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
                        <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-sm font-black text-ink">
                            {isArabic ? 'اضغط لرفع ملف' : 'Tap to upload'}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500">{hintText}</p>
                    </div>
                </button>
            )}

            {isUploading && previewUrl && (
                <div className="rounded-2xl border border-line/80 dark:border-line/10 overflow-hidden bg-surface-raised/40">
                    {showImagePreview && (
                        <img
                            src={previewUrl}
                            alt=""
                            className="w-full max-h-48 object-contain bg-slate-950/5 opacity-80"
                        />
                    )}
                    {showVideoPreview && (
                        <video src={previewUrl} className="w-full max-h-48 bg-black opacity-80" />
                    )}
                </div>
            )}

            {isUploading && (
                <div className="p-5 rounded-2xl border border-line/80 dark:border-line/10 bg-surface-raised/50 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                            <Loader2 className="w-4 h-4 animate-spin text-primary-soft" />
                            {isArabic ? 'جاري الرفع...' : 'Uploading...'}
                        </div>
                        <button
                            type="button"
                            onClick={cancelUpload}
                            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-rose-500 hover:text-rose-600"
                        >
                            <X className="w-3.5 h-3.5" />
                            {isArabic ? 'إلغاء' : 'Cancel'}
                        </button>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary to-brand-cyan transition-all duration-200"
                            style={{ width: `${Math.max(uploadProgress, 8)}%` }}
                        />
                    </div>
                    <p className="text-[10px] font-bold text-slate-500">{uploadProgress}%</p>
                </div>
            )}

            {savedRef && !isUploading && (
                <div className="rounded-2xl border border-line/80 dark:border-line/10 overflow-hidden bg-surface-raised/40">
                    {previewUrl && showImagePreview && (
                        <img
                            src={previewUrl}
                            alt={savedRef.filename || 'Trial media'}
                            className="w-full max-h-64 object-contain bg-slate-950/5"
                        />
                    )}
                    {previewUrl && showVideoPreview && (
                        <video
                            src={previewUrl}
                            controls
                            className="w-full max-h-64 bg-black"
                        />
                    )}
                    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-black text-ink truncate">
                                {savedRef.filename || (isArabic ? 'ملف مرفوع' : 'Uploaded file')}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                                {savedRef.media_type.toUpperCase()} · {formatMediaFileSize(savedRef.size_bytes)}
                                {savedRef.duration_seconds ? ` · ${savedRef.duration_seconds}s` : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary-soft hover:bg-primary/15"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                {isArabic ? 'استبدال' : 'Replace'}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleRemove()}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 hover:bg-rose-500/15"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                {isArabic ? 'حذف' : 'Remove'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {errorMessage && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-bold text-rose-600 dark:text-rose-400">
                    {errorMessage}
                    {!isUploading && (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="block mt-2 text-[10px] font-black uppercase tracking-wider underline"
                        >
                            {isArabic ? 'إعادة المحاولة' : 'Retry upload'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
