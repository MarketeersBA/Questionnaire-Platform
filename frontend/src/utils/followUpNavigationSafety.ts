import type { FollowUpStateMap } from './aiFollowup';
import { buildL2AnswerKey } from './followUpAnswerPersistence';
import {
    buildHeatmapPinFollowUpKey,
    HEATMAP_PIN_FOLLOWUP_SEPARATOR,
} from './packagingHeatmapFeedback';
import {
    filterTasteTestVisibleSections,
} from './tasteTestRespondentNavigation';
import type { TasteTestNavigationPosition } from '../types/respondentNavigation';
import {
    getVisibleProductTestQuestions,
    type ProductTestAnswers,
} from './productTestFlowOrchestration';
import type { ProductTestRespondentSection } from '../types/productTestRespondent';
import type { PackagingHeatmapAnswer } from '../types/productTest';

interface TasteTestLayer2Question {
    id?: string;
}

interface TasteTestLayer2Section {
    title?: string;
    brand?: string | null;
    isBrandDynamic?: boolean;
    questions?: TasteTestLayer2Question[];
}

interface TasteTestSurveyLike {
    layer2_questions?: { sections?: TasteTestLayer2Section[] };
    customizations?: { brands?: string[]; category?: string };
}

/** All follow-up state keys owned by a base question (includes heatmap pin keys). */
export function expandFollowUpKeysForQuestion(
    questionId: string,
    followUpStateMap: FollowUpStateMap,
): string[] {
    const keys = new Set<string>();
    if (followUpStateMap[questionId]) {
        keys.add(questionId);
    }

    const pinPrefix = `${questionId}${HEATMAP_PIN_FOLLOWUP_SEPARATOR}`;
    for (const key of Object.keys(followUpStateMap)) {
        if (key.startsWith(pinPrefix)) {
            keys.add(key);
        }
    }

    return Array.from(keys);
}

export function expandFollowUpKeysForQuestions(
    scopeQuestionIds: string[],
    followUpStateMap: FollowUpStateMap,
): string[] {
    const keys = new Set<string>();
    for (const questionId of scopeQuestionIds) {
        expandFollowUpKeysForQuestion(questionId, followUpStateMap).forEach((key) => keys.add(key));
    }
    return Array.from(keys);
}

/** Follow-up map keys to suspend when leaving the current respondent page/section. */
export function buildFollowUpSuspendKeysForLeavingScope(
    scopeQuestionIds: string[],
    followUpStateMap: FollowUpStateMap,
): string[] {
    return expandFollowUpKeysForQuestions(scopeQuestionIds, followUpStateMap);
}

/** Taste-test L2 answer keys on the current brand/overall page (follow-up map keys). */
export function collectTasteTestFollowUpScopeIds(
    survey: TasteTestSurveyLike | null | undefined,
    position: TasteTestNavigationPosition,
): string[] {
    const sections = survey?.layer2_questions?.sections ?? [];
    const visibleSections = filterTasteTestVisibleSections(sections, position, survey);
    const scopeIds: string[] = [];

    for (const section of visibleSections) {
        for (const question of section.questions ?? []) {
            const questionId = String(question.id || '').trim();
            if (!questionId) continue;
            scopeIds.push(buildL2AnswerKey(position.currentBrand, questionId));
        }
    }

    return scopeIds;
}

function isPackagingHeatmapAnswer(value: unknown): value is PackagingHeatmapAnswer {
    if (!value || typeof value !== 'object') return false;
    return Array.isArray((value as PackagingHeatmapAnswer).clicks);
}

/**
 * Product-test follow-up scope for the active section, including stable heatmap pin keys.
 * Pin keys use 1-based indices aligned with buildHeatmapPinFollowUpKey.
 */
export function collectProductTestSectionFollowUpScopeIds(
    section: ProductTestRespondentSection,
    answers: ProductTestAnswers,
): string[] {
    const scopeIds: string[] = [];
    const visibleQuestions = getVisibleProductTestQuestions(section, answers);

    for (const question of visibleQuestions) {
        scopeIds.push(question.id);

        if (question.type !== 'packaging-heatmap') continue;
        const heatmapAnswer = answers[question.id];
        if (!isPackagingHeatmapAnswer(heatmapAnswer)) continue;

        const clicks = heatmapAnswer.clicks ?? [];
        for (let pinIndex = 0; pinIndex < clicks.length; pinIndex += 1) {
            scopeIds.push(buildHeatmapPinFollowUpKey(question.id, pinIndex));
        }
    }

    return scopeIds;
}

export interface FollowUpNavigationSuspendPlan {
    scopeQuestionIds: string[];
    suspendKeys: string[];
}

export function buildFollowUpNavigationSuspendPlan(
    scopeQuestionIds: string[],
    followUpStateMap: FollowUpStateMap,
): FollowUpNavigationSuspendPlan {
    return {
        scopeQuestionIds,
        suspendKeys: buildFollowUpSuspendKeysForLeavingScope(scopeQuestionIds, followUpStateMap),
    };
}

/**
 * Suspend plan for leaving a taste-test brand/overall page (forward or back navigation).
 * PublicSurvey calls this before advancing brandIndex.
 */
export function buildTasteTestLeavingPageSuspendPlan(
    survey: TasteTestSurveyLike | null | undefined,
    position: TasteTestNavigationPosition,
    followUpStateMap: FollowUpStateMap,
): FollowUpNavigationSuspendPlan {
    const scopeQuestionIds = collectTasteTestFollowUpScopeIds(survey, position);
    return buildFollowUpNavigationSuspendPlan(scopeQuestionIds, followUpStateMap);
}
