import type { AnalysisPoint } from './AIDeepAnalysis';

/** Returns trimmed recommended action when present and non-empty. */
export function getRecommendedActionDisplay(action?: string): string | null {
    const trimmed = action?.trim();
    return trimmed ? trimmed : null;
}

/** Whether a deep-analysis point should show the action pill. */
export function shouldShowRecommendedAction(point: AnalysisPoint): boolean {
    return getRecommendedActionDisplay(point.recommended_action) !== null;
}
