/** Compact asset reference stored in ProductTestAnswers after successful upload. */
export interface ProductTestMediaAnswerReference {
    asset_id: string;
    media_type: 'image' | 'video';
    mime: string;
    filename?: string | null;
    size_bytes: number;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
    uploaded_at: string;
}

export type TrialMediaUploadUiState = 'idle' | 'uploading' | 'ready' | 'error';
