import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Crosshair,
    ImagePlus,
    Loader2,
    Sparkles,
    Trash2,
    Upload,
    Info,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SurveyFormData } from '../pages/CreateSurvey/types';
import type { PackagingImageAsset, PackagingImageSide, ProductTestConfig } from '../types/productTest';
import { DEFAULT_PRODUCT_TEST_CONFIG } from '../utils/blueprintGenerationGuards';
import { packagingHeatmap } from '../services/api';
import {
    PACKAGING_HEATMAP_SCROLL_TARGET_ID,
    countConfiguredPackagingImages,
    formatPackagingFileSize,
    packagingHeatmapQuestionSummary,
    readImageFileMeta,
    revokePackagingPreviewUrl,
    validatePackagingImageFile,
    type PackagingHeatmapLocalPreview,
    type PackagingHeatmapPendingFiles,
} from '../utils/packagingHeatmapConfig';

interface PackagingHeatmapConfigPanelProps {
    formData: SurveyFormData;
    setFormData: React.Dispatch<React.SetStateAction<SurveyFormData>>;
    draftSurveyId?: string | null;
    pendingFiles: PackagingHeatmapPendingFiles;
    onPendingFilesChange: React.Dispatch<React.SetStateAction<PackagingHeatmapPendingFiles>>;
}

interface SideSlotState {
    preview: PackagingHeatmapLocalPreview | null;
    uploading: boolean;
}

const EMPTY_SLOT: SideSlotState = { preview: null, uploading: false };

function resolvePtConfig(formData: SurveyFormData): ProductTestConfig {
    return formData.product_test_config || { ...DEFAULT_PRODUCT_TEST_CONFIG };
}

function mergePtConfig(
    setFormData: PackagingHeatmapConfigPanelProps['setFormData'],
    patch: Partial<ProductTestConfig>,
) {
    setFormData((prev) => ({
        ...prev,
        product_test_config: {
            ...(prev.product_test_config || DEFAULT_PRODUCT_TEST_CONFIG),
            ...patch,
        },
    }));
}

function assetLabel(asset: PackagingImageAsset | null | undefined): string | null {
    if (!asset) return null;
    return `${asset.width}×${asset.height} · ${asset.mime.replace('image/', '').toUpperCase()}`;
}

export default function PackagingHeatmapConfigPanel({
    formData,
    setFormData,
    draftSurveyId,
    pendingFiles,
    onPendingFilesChange,
}: PackagingHeatmapConfigPanelProps) {
    const ptConfig = resolvePtConfig(formData);
    const ownBrand = formData.config?.own_brand?.trim() || '';
    const enabled = Boolean(ptConfig.packaging_heatmap_enabled);
    const canConfigure = Boolean(ownBrand);

    const [slotState, setSlotState] = useState<Record<PackagingImageSide, SideSlotState>>({
        front: { ...EMPTY_SLOT },
        back: { ...EMPTY_SLOT },
    });

    const frontInputRef = useRef<HTMLInputElement>(null);
    const backInputRef = useRef<HTMLInputElement>(null);
    const previewsRef = useRef<Record<PackagingImageSide, string | null>>({ front: null, back: null });

    const imageCount = useMemo(
        () => countConfiguredPackagingImages(ptConfig, pendingFiles),
        [ptConfig, pendingFiles],
    );

    const questionSummary = useMemo(
        () => packagingHeatmapQuestionSummary(ptConfig, pendingFiles),
        [ptConfig, pendingFiles],
    );

    const setSideUploading = useCallback((side: PackagingImageSide, uploading: boolean) => {
        setSlotState((prev) => ({
            ...prev,
            [side]: { ...prev[side], uploading },
        }));
    }, []);

    const setSidePreview = useCallback((side: PackagingImageSide, preview: PackagingHeatmapLocalPreview | null) => {
        setSlotState((prev) => {
            const oldUrl = prev[side].preview?.url;
            if (oldUrl && oldUrl !== preview?.url) {
                revokePackagingPreviewUrl(oldUrl);
            }
            if (preview?.url) {
                previewsRef.current[side] = preview.url;
            }
            return {
                ...prev,
                [side]: { ...prev[side], preview },
            };
        });
    }, []);

    useEffect(() => {
        return () => {
            (['front', 'back'] as const).forEach((side) => {
                revokePackagingPreviewUrl(previewsRef.current[side]);
            });
        };
    }, []);

    const handleToggle = (next: boolean) => {
        if (next && !canConfigure) {
            toast.error('Select a target brand first (sparkle icon on a brand chip).');
            document.getElementById('brand-architecture-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        mergePtConfig(setFormData, { packaging_heatmap_enabled: next });
    };

    const applyUploadedAsset = (side: PackagingImageSide, asset: PackagingImageAsset) => {
        const images = {
            front: ptConfig.packaging_heatmap_images?.front ?? null,
            back: ptConfig.packaging_heatmap_images?.back ?? null,
            [side]: asset,
        };
        mergePtConfig(setFormData, { packaging_heatmap_images: images });
        onPendingFilesChange((prev) => ({ ...prev, [side]: null }));
    };

    const clearSide = async (side: PackagingImageSide) => {
        const asset = ptConfig.packaging_heatmap_images?.[side];
        if (draftSurveyId && asset?.asset_id) {
            try {
                setSideUploading(side, true);
                await packagingHeatmap.deleteImage(draftSurveyId, side);
            } catch {
                toast.error(`Could not remove ${side} image from server.`);
                setSideUploading(side, false);
                return;
            }
        }

        setSidePreview(side, null);
        onPendingFilesChange((prev) => ({ ...prev, [side]: null }));

        const images = {
            front: ptConfig.packaging_heatmap_images?.front ?? null,
            back: ptConfig.packaging_heatmap_images?.back ?? null,
            [side]: null,
        };
        mergePtConfig(setFormData, { packaging_heatmap_images: images });
        setSideUploading(side, false);
        toast.success(`${side === 'front' ? 'Front' : 'Back'} image removed`);
    };

    const processFile = async (side: PackagingImageSide, file: File) => {
        const validationError = validatePackagingImageFile(file);
        if (validationError) {
            toast.error(validationError);
            return;
        }

        setSideUploading(side, true);
        try {
            const preview = await readImageFileMeta(file);
            setSidePreview(side, preview);

            if (draftSurveyId) {
                const asset = await packagingHeatmap.uploadImage(draftSurveyId, side, file) as PackagingImageAsset;
                applyUploadedAsset(side, asset);
                toast.success(`${side === 'front' ? 'Front' : 'Back'} packaging image uploaded`);
            } else {
                onPendingFilesChange((prev) => ({ ...prev, [side]: file }));
                toast.success(`${side === 'front' ? 'Front' : 'Back'} image staged — will upload on deploy`);
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to process packaging image.');
            setSidePreview(side, null);
        } finally {
            setSideUploading(side, false);
        }
    };

    const onFileInput = (side: PackagingImageSide) => async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        await processFile(side, file);
    };

    const onDrop = (side: PackagingImageSide) => async (event: React.DragEvent) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (!file) return;
        await processFile(side, file);
    };

    const renderSlot = (side: PackagingImageSide, required: boolean) => {
        const asset = ptConfig.packaging_heatmap_images?.[side];
        const pending = pendingFiles[side];
        const state = slotState[side];
        const hasContent = Boolean(asset?.asset_id || pending || state.preview);
        const previewUrl = state.preview?.url;
        const metaLine = state.preview
            ? `${state.preview.width}×${state.preview.height} · ${formatPackagingFileSize(state.preview.sizeBytes)}`
            : assetLabel(asset);

        return (
            <div
                key={side}
                className={`relative rounded-3xl border-2 border-dashed transition-all ${
                    hasContent
                        ? 'border-violet-300 dark:border-violet-800 bg-surface'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/30 hover:border-violet-400 dark:hover:border-violet-700'
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop(side)}
            >
                <input
                    ref={side === 'front' ? frontInputRef : backInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onFileInput(side)}
                />

                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {side === 'front' ? 'Front' : 'Back'} of pack
                                {required && <span className="text-rose-500 ml-1">*</span>}
                            </p>
                            {metaLine && (
                                <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 mt-1">{metaLine}</p>
                            )}
                            {pending && !asset?.asset_id && (
                                <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mt-1">
                                    Staged locally · uploads on deploy
                                </p>
                            )}
                        </div>
                        {hasContent && (
                            <button
                                type="button"
                                onClick={() => clearSide(side)}
                                disabled={state.uploading}
                                className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                title="Remove image"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {previewUrl ? (
                        <div className="relative rounded-2xl overflow-hidden border border-line/80 dark:border-line/10 bg-surface-sunken aspect-[4/3] flex items-center justify-center">
                            <img
                                src={previewUrl}
                                alt={`${side} packaging preview`}
                                className="max-h-full max-w-full object-contain"
                            />
                            {state.uploading && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                                </div>
                            )}
                        </div>
                    ) : asset?.asset_id ? (
                        <div className="rounded-2xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 p-6 text-center space-y-2">
                            <ImagePlus className="w-8 h-8 text-violet-500 mx-auto" />
                            <p className="text-xs font-bold text-ink-muted">Image saved on server</p>
                            <p className="text-[10px] text-slate-500 font-mono truncate">{asset.filename || asset.asset_id}</p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => (side === 'front' ? frontInputRef : backInputRef).current?.click()}
                            disabled={!enabled || state.uploading}
                            className="w-full rounded-2xl border border-line/80 dark:border-line/10 bg-surface py-10 flex flex-col items-center gap-3 hover:border-violet-400 dark:hover:border-violet-700 transition-colors disabled:opacity-50"
                        >
                            {state.uploading ? (
                                <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
                            ) : (
                                <Upload className="w-7 h-7 text-violet-500" />
                            )}
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Drop image or click to browse
                            </span>
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div
            id={PACKAGING_HEATMAP_SCROLL_TARGET_ID}
            className="rounded-[2rem] border-2 border-violet-200 dark:border-violet-900/40 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/20 dark:to-slate-950 p-8 space-y-6"
        >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <Crosshair className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                        <h4 className="text-lg font-display font-black text-ink tracking-tight">
                            Packaging Heatmap
                        </h4>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                            Click-map testing for target brand packaging only
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={!canConfigure}
                    onClick={() => handleToggle(!enabled)}
                    className={`relative inline-flex h-11 w-[4.5rem] shrink-0 items-center rounded-full transition-colors ${
                        !canConfigure
                            ? 'bg-slate-200 dark:bg-slate-800 cursor-not-allowed opacity-60'
                            : enabled
                                ? 'bg-violet-600'
                                : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                >
                    <span
                        className={`inline-block h-8 w-8 transform rounded-full bg-white shadow-md transition-transform ${
                            enabled ? 'translate-x-9' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            <AnimatePresence>
                {!canConfigure && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20"
                    >
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                            Select a <strong>target brand</strong> first — click the sparkle icon on a brand chip in Brand Architecture above.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {enabled && canConfigure && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {renderSlot('front', true)}
                        {renderSlot('back', false)}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-violet-500/5 border border-violet-500/15">
                        <div className="flex items-center gap-2">
                            <Info className="w-4 h-4 text-violet-600" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 dark:text-violet-300">
                                Target brand: {ownBrand}
                            </span>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-200">{questionSummary}</p>
                            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                                {imageCount === 0
                                    ? 'Attraction · Dislikes · Improve per image'
                                    : `${imageCount} image${imageCount > 1 ? 's' : ''} configured`}
                            </p>
                        </div>
                    </div>

                    {!draftSurveyId && (pendingFiles.front || pendingFiles.back) && (
                        <p className="text-[10px] text-slate-500 font-medium text-center">
                            Images are staged locally and will upload automatically when you deploy the survey.
                        </p>
                    )}
                </motion.div>
            )}
        </div>
    );
}
