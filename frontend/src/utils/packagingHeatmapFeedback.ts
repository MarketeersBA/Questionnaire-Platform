import type {
    PackagingHeatmapAnswer,
    PackagingHeatmapClick,
    PackagingHeatmapIntent,
    RegionFeedback,
} from '../types/productTest';

export const HEATMAP_PIN_FOLLOWUP_SEPARATOR = '__pin_';

export function buildHeatmapPinFollowUpKey(questionId: string, pinIndex: number): string {
    return `${questionId}${HEATMAP_PIN_FOLLOWUP_SEPARATOR}${pinIndex + 1}`;
}

export function parseHeatmapPinFollowUpKey(key: string): { questionId: string; pinIndex: number } | null {
    const [questionId, rawIndex, ...rest] = key.split(HEATMAP_PIN_FOLLOWUP_SEPARATOR);
    if (!questionId || !rawIndex || rest.length > 0) return null;
    const oneBased = Number(rawIndex);
    if (!Number.isInteger(oneBased) || oneBased < 1) return null;
    return { questionId, pinIndex: oneBased - 1 };
}

export function heatmapIntentToSentiment(intent: PackagingHeatmapIntent | string): RegionFeedback['sentiment'] {
    if (intent === 'dislikes') return 'dislike';
    if (intent === 'improve') return 'recommend';
    return 'like';
}

export function getHeatmapPinComment(click: PackagingHeatmapClick): string {
    return (click.feedback?.comment ?? click.comment ?? '').trim();
}

export function hasHeatmapPinVoice(click: PackagingHeatmapClick): boolean {
    return Boolean(click.feedback?.voice_note_asset_id);
}

export function isHeatmapPinFeedbackAnswered(click: PackagingHeatmapClick): boolean {
    return getHeatmapPinComment(click).length > 0 || hasHeatmapPinVoice(click);
}

export function isHeatmapPinAiRequested(click: PackagingHeatmapClick): boolean {
    return click.feedback?.follow_up_requested === true;
}

export function isHeatmapPinComplete(
    click: PackagingHeatmapClick,
    options: { requireFollowUp?: boolean } = {},
): boolean {
    if (!isHeatmapPinFeedbackAnswered(click)) return false;
    if (options.requireFollowUp && !isHeatmapPinAiRequested(click)) return false;
    return true;
}

export function findFirstIncompleteHeatmapPin(
    answer: PackagingHeatmapAnswer,
    options: { requireFollowUp?: boolean } = {},
): number | null {
    const clicks = answer.clicks || [];
    for (let index = 0; index < clicks.length; index += 1) {
        if (!isHeatmapPinComplete(clicks[index], options)) return index;
    }
    return null;
}

export function isHeatmapAnswerComplete(
    answer: PackagingHeatmapAnswer,
    options: { requireFollowUp?: boolean } = {},
): boolean {
    const clicks = answer.clicks || [];
    return clicks.length > 0 && findFirstIncompleteHeatmapPin(answer, options) === null;
}

export function upsertHeatmapClickFeedback(
    click: PackagingHeatmapClick,
    intent: PackagingHeatmapIntent | string,
    feedback: Partial<RegionFeedback & { follow_up_requested?: boolean }>,
): PackagingHeatmapClick {
    return {
        ...click,
        feedback: {
            sentiment: heatmapIntentToSentiment(intent),
            ...(click.feedback || {}),
            ...feedback,
        },
    };
}
