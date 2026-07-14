import type {
    ProductTestRespondentPhase,
    ProductTestRespondentQuestion,
    ProductTestRespondentSection,
    ProductTestSnapshot,
    ProductTestTimingPhase,
} from '../types/productTestRespondent';
import type {
    ProductTestStructuredSubmission,
    ProductTestSubmissionOptions,
} from '../types/productTestSubmission';
import { buildProductTestAttributeRegistry } from './productTestBlueprintUtils';
import { resolveProductTestEvaluationBrandFields } from './productTestSubmissionBrand';
import { migrateLegacyL2ToProductTestSnapshot } from './productTestSnapshotBuilder';
import { isProductTestMediaAnswerComplete } from './productTestMediaAnswer';
import {
    classifyProductTestEvaluationValue,
    extractMediaReferenceFields,
} from './productTestValueClassification';
import type { PackagingHeatmapAnswer } from '../types/productTest';
import type {
    NavigationBounds,
    NavigationDirection,
    ProductTestNavigationAdvance,
    ProductTestNavigationCursor,
    ProductTestNavigationPosition,
    ProductTestWizardMode,
} from '../types/respondentNavigation';
import { isHeatmapAnswerComplete } from './packagingHeatmapFeedback';

export type { ProductTestStructuredSubmission, ProductTestSubmissionOptions };
export type {
    ProductTestNavigationAdvance,
    ProductTestNavigationCursor,
    ProductTestNavigationPosition,
    ProductTestWizardMode,
};

export type ProductTestAnswers = Record<string, unknown>;

function readNumericAnswer(value: unknown): number | null {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}

/** True when a conditional product-test question should be shown to the respondent. */
export function isProductTestQuestionVisible(
    question: ProductTestRespondentQuestion,
    answers: ProductTestAnswers,
): boolean {
    const condition = question.visibilityCondition;
    if (!condition) return true;

    const score = readNumericAnswer(answers[condition.dependsOnQuestionId]);
    if (score === null) return false;

    const min = condition.min ?? 6;
    const max = condition.max ?? 10;
    return score >= min && score <= max;
}

export function getVisibleProductTestQuestions(
    section: ProductTestRespondentSection,
    answers: ProductTestAnswers,
): ProductTestRespondentQuestion[] {
    return section.questions.filter((question) => isProductTestQuestionVisible(question, answers));
}

/**
 * Drop answers (and return cleared ids) for conditional questions that became hidden.
 * Call after the controlling scale answer changes.
 */
export function reconcileHiddenConditionalAnswers(
    section: ProductTestRespondentSection,
    answers: ProductTestAnswers,
): { answers: ProductTestAnswers; clearedQuestionIds: string[] } {
    const clearedQuestionIds: string[] = [];
    const next = { ...answers };

    for (const question of section.questions) {
        if (!question.visibilityCondition) continue;
        if (isProductTestQuestionVisible(question, next)) continue;
        if (next[question.id] !== undefined) {
            clearedQuestionIds.push(question.id);
            delete next[question.id];
        }
    }

    return { answers: next, clearedQuestionIds };
}

export interface ProductTestWizardPosition {
    phaseIndex: number;
    sectionIndex: number;
    phase: ProductTestRespondentPhase | null;
    section: ProductTestRespondentSection | null;
    totalPhases: number;
    isLastSection: boolean;
    journeyStepIndex: number;
    totalJourneySteps: number;
}

export type ProductTestJourneyGroup =
    | 'brand_evaluation'
    | 'preference'
    | 'global_after_use'
    | 'packaging';

export interface ProductTestWizardJourneyStep {
    stepIndex: number;
    phaseIndex: number;
    sectionIndex: number;
    brand: string | null;
    timing: ProductTestTimingPhase;
    sectionId: string;
    journeyGroup: ProductTestJourneyGroup;
}

const BRAND_EVALUATION_TIMINGS: ProductTestTimingPhase[] = [
    'before_use',
    'during_use',
    'after_use',
];

const PREFERENCE_SECTION_ID = 'product_preference';
const TRIAL_MEDIA_SECTION_ID = 'trial_media_capture';

interface ProductTestSectionRef {
    phaseIndex: number;
    sectionIndex: number;
    section: ProductTestRespondentSection;
    phaseTiming: ProductTestTimingPhase;
}

function sectionRefKey(ref: Pick<ProductTestSectionRef, 'phaseIndex' | 'sectionIndex'>): string {
    return `${ref.phaseIndex}:${ref.sectionIndex}`;
}

function collectSnapshotSectionRefs(snapshot: ProductTestSnapshot): ProductTestSectionRef[] {
    const refs: ProductTestSectionRef[] = [];
    snapshot.phases.forEach((phase, phaseIndex) => {
        phase.sections.forEach((section, sectionIndex) => {
            refs.push({ phaseIndex, sectionIndex, section, phaseTiming: phase.timing });
        });
    });
    return refs;
}

/** Target/internal brand first, then remaining brands in snapshot order. */
export function resolveProductTestBrandOrder(snapshot: ProductTestSnapshot): string[] {
    const brands = snapshot.brand_context?.brands ?? [];
    if (!brands.length) return [];

    const ownBrand = snapshot.brand_context?.own_brand?.trim();
    const ordered: string[] = [];
    if (ownBrand && brands.includes(ownBrand)) {
        ordered.push(ownBrand);
    }
    for (const brand of brands) {
        if (!ordered.includes(brand)) {
            ordered.push(brand);
        }
    }
    return ordered;
}

function isBrandProductTestSection(section: ProductTestRespondentSection): boolean {
    return Boolean(section.brand) && section.module === 'product_test';
}

function isPreferenceSection(section: ProductTestRespondentSection): boolean {
    return section.id === PREFERENCE_SECTION_ID;
}

function isGlobalAfterUseSection(section: ProductTestRespondentSection): boolean {
    return !section.brand && (
        section.module === 'trial_media_capture'
        || section.id === TRIAL_MEDIA_SECTION_ID
    );
}

function isPackagingJourneySection(
    section: ProductTestRespondentSection,
    phaseTiming: ProductTestTimingPhase,
): boolean {
    if (phaseTiming === 'packaging') return true;
    return section.module === 'package_test' || section.module === 'packaging_heatmap';
}

function toJourneyStep(
    ref: ProductTestSectionRef,
    stepIndex: number,
    journeyGroup: ProductTestJourneyGroup,
): ProductTestWizardJourneyStep {
    return {
        stepIndex,
        phaseIndex: ref.phaseIndex,
        sectionIndex: ref.sectionIndex,
        brand: ref.section.brand ?? null,
        timing: ref.section.timing,
        sectionId: ref.section.id,
        journeyGroup,
    };
}

/**
 * Flatten snapshot sections into brand-first respondent order while preserving
 * the underlying phase/section coordinates for analytics compatibility.
 */
export function buildProductTestWizardJourney(snapshot: ProductTestSnapshot): ProductTestWizardJourneyStep[] {
    const refs = collectSnapshotSectionRefs(snapshot);
    const brandOrder = resolveProductTestBrandOrder(snapshot);

    if (!brandOrder.length) {
        return refs.map((ref, index) => toJourneyStep(
            ref,
            index,
            isPackagingJourneySection(ref.section, ref.phaseTiming)
                ? 'packaging'
                : isPreferenceSection(ref.section)
                    ? 'preference'
                    : isGlobalAfterUseSection(ref.section)
                        ? 'global_after_use'
                        : 'brand_evaluation',
        ));
    }

    const used = new Set<string>();
    const steps: ProductTestWizardJourneyStep[] = [];

    const appendRefs = (
        candidates: ProductTestSectionRef[],
        journeyGroup: ProductTestJourneyGroup,
    ) => {
        for (const ref of candidates) {
            const key = sectionRefKey(ref);
            if (used.has(key)) continue;
            used.add(key);
            steps.push(toJourneyStep(ref, steps.length, journeyGroup));
        }
    };

    for (const brand of brandOrder) {
        for (const timing of BRAND_EVALUATION_TIMINGS) {
            const brandTimingRefs = refs.filter((ref) =>
                isBrandProductTestSection(ref.section)
                && ref.section.brand === brand
                && ref.section.timing === timing,
            );
            appendRefs(brandTimingRefs, 'brand_evaluation');
        }
    }

    appendRefs(refs.filter((ref) => isPreferenceSection(ref.section)), 'preference');
    appendRefs(refs.filter((ref) => isGlobalAfterUseSection(ref.section)), 'global_after_use');
    appendRefs(
        refs.filter((ref) => isPackagingJourneySection(ref.section, ref.phaseTiming)),
        'packaging',
    );

    const remaining = refs.filter((ref) => !used.has(sectionRefKey(ref)));
    appendRefs(remaining, 'brand_evaluation');

    return steps.map((step, index) => ({ ...step, stepIndex: index }));
}

export function resolveJourneyStepIndex(
    journey: ProductTestWizardJourneyStep[],
    phaseIndex: number,
    sectionIndex: number,
): number {
    const index = journey.findIndex(
        (step) => step.phaseIndex === phaseIndex && step.sectionIndex === sectionIndex,
    );
    return index >= 0 ? index : 0;
}

export function getJourneyStep(
    journey: ProductTestWizardJourneyStep[],
    journeyStepIndex: number,
): ProductTestWizardJourneyStep | null {
    return journey[journeyStepIndex] ?? null;
}

export function computeProductTestJourneyProgress(
    journey: ProductTestWizardJourneyStep[],
    journeyStepIndex: number,
    wizardMode: 'intro' | 'section',
): number {
    if (journey.length === 0) return 0;
    const completed = journeyStepIndex + (wizardMode === 'section' ? 1 : 0);
    return Math.min(100, Math.round((completed / journey.length) * 100));
}

export type ProductTestWizardAdvance =
    | { type: 'section'; phaseIndex: number; sectionIndex: number }
    | { type: 'complete' };

export interface ProductTestValidationIssue {
    questionId: string;
    message: string;
}

export type ProductTestSubmissionPayload = ProductTestStructuredSubmission;

const PRODUCT_TEST_MODULE_IDS = new Set(['product_test', 'package_test', 'packaging_heatmap', 'trial_media_capture']);

export function isProductTestSurvey(survey: any): boolean {
    if (survey?.survey_type === 'product_test' || survey?.type === 'product_test') {
        return true;
    }
    const modules = new Set<string>([
        ...(survey?.selected_modules || []),
        ...(survey?.module_sequence || []),
        ...(survey?.config?.module_sequence || []),
    ]);
    return modules.has('product_test');
}

export function snapshotHasQuestions(snapshot: ProductTestSnapshot | null | undefined): boolean {
    if (!snapshot?.phases?.length) return false;
    return snapshot.phases.some((phase) =>
        phase.sections.some((section) => section.questions.length > 0),
    );
}

export function isProductTestEnabled(survey: any): boolean {
    if (!isProductTestSurvey(survey)) return false;
    return snapshotHasQuestions(getProductTestSnapshot(survey));
}

/** Read snapshot from API payload; fall back to legacy L2 migration during rollout. */
export function getProductTestSnapshot(survey: any): ProductTestSnapshot | null {
    const stored = survey?.product_test_snapshot;
    if (snapshotHasQuestions(stored)) {
        return stored as ProductTestSnapshot;
    }

    const language =
        survey?.product_test_config?.language
        || survey?.language
        || 'en';

    const migrated = migrateLegacyL2ToProductTestSnapshot(
        survey?.layer2_questions,
        language === 'ar' ? 'ar' : 'en',
    );
    if (snapshotHasQuestions(migrated)) {
        return migrated;
    }

    return stored || migrated || null;
}

export function getProductTestWizardPosition(
    snapshot: ProductTestSnapshot,
    phaseIndex: number,
    sectionIndex: number,
    journey: ProductTestWizardJourneyStep[] = buildProductTestWizardJourney(snapshot),
): ProductTestWizardPosition {
    const phases = snapshot.phases || [];
    const journeyStepIndex = resolveJourneyStepIndex(journey, phaseIndex, sectionIndex);
    const journeyStep = getJourneyStep(journey, journeyStepIndex);
    const resolvedPhaseIndex = journeyStep?.phaseIndex ?? phaseIndex;
    const resolvedSectionIndex = journeyStep?.sectionIndex ?? sectionIndex;
    const phase = phases[resolvedPhaseIndex] ?? null;
    const section = phase?.sections[resolvedSectionIndex] ?? null;

    return {
        phaseIndex: resolvedPhaseIndex,
        sectionIndex: resolvedSectionIndex,
        phase,
        section,
        totalPhases: phases.length,
        isLastSection: journeyStepIndex >= journey.length - 1,
        journeyStepIndex,
        totalJourneySteps: journey.length,
    };
}

/** Advance wizard cursor along the brand-first journey sequence. */
export function getNextProductTestPhase(
    snapshot: ProductTestSnapshot,
    phaseIndex: number,
    sectionIndex: number,
    journey: ProductTestWizardJourneyStep[] = buildProductTestWizardJourney(snapshot),
): ProductTestWizardAdvance {
    const currentStepIndex = resolveJourneyStepIndex(journey, phaseIndex, sectionIndex);
    const nextStep = getJourneyStep(journey, currentStepIndex + 1);
    if (!nextStep) {
        return { type: 'complete' };
    }

    return {
        type: 'section',
        phaseIndex: nextStep.phaseIndex,
        sectionIndex: nextStep.sectionIndex,
    };
}

/** Retreat wizard cursor along the brand-first journey sequence. */
export function getPreviousProductTestPhase(
    snapshot: ProductTestSnapshot,
    phaseIndex: number,
    sectionIndex: number,
    journey: ProductTestWizardJourneyStep[] = buildProductTestWizardJourney(snapshot),
): ProductTestWizardAdvance | { type: 'boundary' } {
    const currentStepIndex = resolveJourneyStepIndex(journey, phaseIndex, sectionIndex);
    const previousStep = getJourneyStep(journey, currentStepIndex - 1);
    if (!previousStep) {
        return { type: 'boundary' };
    }

    return {
        type: 'section',
        phaseIndex: previousStep.phaseIndex,
        sectionIndex: previousStep.sectionIndex,
    };
}

export function resolveInitialProductTestWizardMode(journeyStepIndex: number): ProductTestWizardMode {
    return journeyStepIndex === 0 ? 'intro' : 'section';
}

/** Whether the next journey step should open with a phase intro screen. */
export function shouldShowProductTestPhaseIntro(
    currentStepIndex: number,
    nextStepIndex: number,
    journey: ProductTestWizardJourneyStep[],
): boolean {
    const current = getJourneyStep(journey, currentStepIndex);
    const next = getJourneyStep(journey, nextStepIndex);
    if (!next) return false;
    if (!current) return true;

    if (next.journeyGroup === 'packaging' && current.journeyGroup !== 'packaging') {
        return true;
    }
    if (next.journeyGroup === 'brand_evaluation' && current.journeyGroup !== 'brand_evaluation') {
        return next.timing === 'before_use';
    }
    if (next.journeyGroup !== 'brand_evaluation') {
        return false;
    }

    return next.timing !== current.timing || next.brand !== current.brand;
}

export function resolveProductTestNavigationPosition(
    snapshot: ProductTestSnapshot,
    cursor: ProductTestNavigationCursor,
    journey: ProductTestWizardJourneyStep[] = buildProductTestWizardJourney(snapshot),
): ProductTestNavigationPosition {
    const journeyStepIndex = resolveJourneyStepIndex(journey, cursor.phaseIndex, cursor.sectionIndex);
    const totalJourneySteps = journey.length;
    const isFirstJourneyStep = journeyStepIndex <= 0;
    const isLastJourneyStep = journeyStepIndex >= totalJourneySteps - 1;

    return {
        cursor,
        journeyStepIndex,
        totalJourneySteps,
        isFirstJourneyStep,
        isLastJourneyStep,
        progressPercent: computeProductTestJourneyProgress(journey, journeyStepIndex, cursor.wizardMode),
        bounds: resolveProductTestNavigationBounds(snapshot, cursor, journey),
    };
}

export function resolveProductTestNavigationBounds(
    snapshot: ProductTestSnapshot,
    cursor: ProductTestNavigationCursor,
    journey: ProductTestWizardJourneyStep[] = buildProductTestWizardJourney(snapshot),
): NavigationBounds {
    const journeyStepIndex = resolveJourneyStepIndex(journey, cursor.phaseIndex, cursor.sectionIndex);
    const canGoBack = !(cursor.wizardMode === 'intro' && journeyStepIndex === 0);

    return {
        canGoBack,
        canGoForward: true,
    };
}

/**
 * Compute the next in-flow product-test navigation target.
 * Forward from intro enters section; forward from section advances journey.
 * Back from section returns to intro when applicable; back from intro retreats journey.
 */
export function advanceProductTestNavigation(
    snapshot: ProductTestSnapshot,
    cursor: ProductTestNavigationCursor,
    direction: NavigationDirection,
    journey: ProductTestWizardJourneyStep[] = buildProductTestWizardJourney(snapshot),
): ProductTestNavigationAdvance {
    const journeyStepIndex = resolveJourneyStepIndex(journey, cursor.phaseIndex, cursor.sectionIndex);

    if (direction === 'forward') {
        if (cursor.wizardMode === 'intro') {
            return {
                type: 'section',
                phaseIndex: cursor.phaseIndex,
                sectionIndex: cursor.sectionIndex,
                wizardMode: 'section',
            };
        }

        const next = getNextProductTestPhase(snapshot, cursor.phaseIndex, cursor.sectionIndex, journey);
        if (next.type === 'complete') {
            return { type: 'complete' };
        }

        const nextStepIndex = resolveJourneyStepIndex(journey, next.phaseIndex, next.sectionIndex);
        return {
            type: 'section',
            phaseIndex: next.phaseIndex,
            sectionIndex: next.sectionIndex,
            wizardMode: shouldShowProductTestPhaseIntro(journeyStepIndex, nextStepIndex, journey)
                ? 'intro'
                : 'section',
        };
    }

    if (cursor.wizardMode === 'section') {
        const arrivedViaIntro = journeyStepIndex > 0
            && shouldShowProductTestPhaseIntro(journeyStepIndex - 1, journeyStepIndex, journey);
        if (arrivedViaIntro || (journeyStepIndex === 0 && cursor.wizardMode === 'section')) {
            const stepHasIntro = journeyStepIndex === 0
                ? resolveInitialProductTestWizardMode(0) === 'intro'
                : arrivedViaIntro;
            if (stepHasIntro) {
                return {
                    type: 'intro',
                    phaseIndex: cursor.phaseIndex,
                    sectionIndex: cursor.sectionIndex,
                };
            }
        }
    }

    if (cursor.wizardMode === 'intro' && journeyStepIndex === 0) {
        return { type: 'boundary' };
    }

    const previous = getPreviousProductTestPhase(snapshot, cursor.phaseIndex, cursor.sectionIndex, journey);
    if (previous.type === 'boundary') {
        return { type: 'boundary' };
    }

    const previousStepIndex = resolveJourneyStepIndex(journey, previous.phaseIndex, previous.sectionIndex);
    const wizardMode: ProductTestWizardMode = cursor.wizardMode === 'intro'
        ? 'section'
        : (
            previousStepIndex > 0
            && shouldShowProductTestPhaseIntro(previousStepIndex - 1, previousStepIndex, journey)
        )
            ? 'intro'
            : 'section';

    return {
        type: 'section',
        phaseIndex: previous.phaseIndex,
        sectionIndex: previous.sectionIndex,
        wizardMode,
    };
}

export function applyProductTestNavigationAdvance(
    cursor: ProductTestNavigationCursor,
    advance: ProductTestNavigationAdvance,
): ProductTestNavigationCursor | null {
    if (advance.type === 'boundary' || advance.type === 'complete') {
        return null;
    }

    if (advance.type === 'intro') {
        return {
            phaseIndex: advance.phaseIndex,
            sectionIndex: advance.sectionIndex,
            wizardMode: 'intro',
        };
    }

    return {
        phaseIndex: advance.phaseIndex,
        sectionIndex: advance.sectionIndex,
        wizardMode: advance.wizardMode,
    };
}

function isPackagingHeatmapAnswer(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const obj = value as { clicks?: unknown; image_side?: unknown; intent?: unknown };
    return Array.isArray(obj.clicks);
}

interface ProductTestValidationOptions {
    requireHeatmapFollowUp?: boolean;
}

function isAnswerComplete(value: unknown, options: ProductTestValidationOptions = {}): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return !Number.isNaN(value);
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (isPackagingHeatmapAnswer(obj)) {
            return isHeatmapAnswerComplete(obj as unknown as PackagingHeatmapAnswer, {
                requireFollowUp: options.requireHeatmapFollowUp,
            });
        }
        if ('text' in obj || 'voice_feedback_id' in obj) {
            const text = typeof obj.text === 'string' ? obj.text.trim() : '';
            return text.length > 0 || Boolean(obj.voice_feedback_id);
        }
        if (isProductTestMediaAnswerComplete(obj)) {
            return true;
        }
    }
    return false;
}

export function validateProductTestSection(
    answers: ProductTestAnswers,
    section: ProductTestRespondentSection,
    language: 'en' | 'ar' = 'en',
    options: ProductTestValidationOptions = {},
): ProductTestValidationIssue[] {
    const issues: ProductTestValidationIssue[] = [];

    for (const question of section.questions) {
        if (!question.required) continue;
        if (!isProductTestQuestionVisible(question, answers)) continue;
        if (isAnswerComplete(answers[question.id], options)) continue;

        issues.push({
            questionId: question.id,
            message:
                question.type === 'media-upload'
                    ? language === 'ar'
                        ? 'يرجى رفع صورة أو فيديو قبل المتابعة.'
                        : 'Please upload a photo or video before continuing.'
                    : question.type === 'packaging-heatmap'
                        ? language === 'ar'
                            ? 'يرجى إضافة تعليق مكتوب أو تسجيل صوتي لكل نقطة محددة، ثم إكمال المتابعة الذكية.'
                            : 'Please add text or a voice note for every selected pin, then complete the AI follow-up.'
                    : language === 'ar'
                        ? `يرجى الإجابة على: ${question.text}`
                        : `Please answer: ${question.text}`,
        });
    }

    return issues;
}

/** Validate all sections in a timing phase. */
export function validateProductTestPhase(
    answers: ProductTestAnswers,
    phase: ProductTestRespondentPhase,
    language: 'en' | 'ar' = 'en',
    options: ProductTestValidationOptions = {},
): ProductTestValidationIssue[] {
    return phase.sections.flatMap((section) =>
        validateProductTestSection(answers, section, language, options),
    );
}

export function buildProductTestSubmission(
    answers: ProductTestAnswers,
    snapshot: ProductTestSnapshot,
    options: ProductTestSubmissionOptions = {},
): ProductTestSubmissionPayload {
    const flat_evaluations: ProductTestSubmissionPayload['flat_evaluations'] = [];

    const phases = snapshot.phases.map((phase) => ({
        timing: phase.timing,
        label: phase.label,
        sections: phase.sections.map((section) => {
            const sectionAnswers: Record<string, unknown> = {};
            section.questions.forEach((question) => {
                if (!isProductTestQuestionVisible(question, answers)) return;
                if (answers[question.id] !== undefined) {
                    const answerValue = answers[question.id];
                    sectionAnswers[question.id] = answerValue;
                    const brandFields = resolveProductTestEvaluationBrandFields(
                        section,
                        question,
                        options,
                    );
                    const valueKind = classifyProductTestEvaluationValue(answerValue, {
                        module: section.module,
                        questionType: question.type,
                    });
                    const mediaFields = extractMediaReferenceFields(answerValue);
                    flat_evaluations.push({
                        question_id: question.id,
                        ...brandFields,
                        section_id: section.id,
                        section_title: section.title,
                        attribute: section.title,
                        timing: phase.timing,
                        module: section.module,
                        diagnostic_tag: question.diagnostic_tag ?? null,
                        question_text: question.text,
                        question_type: question.type,
                        value_kind: valueKind,
                        media_asset_id: mediaFields.media_asset_id,
                        media_type: mediaFields.media_type,
                        value: answerValue,
                    });
                }
            });
            return {
                sectionId: section.id,
                title: section.title,
                module: section.module,
                timing: section.timing,
                answers: sectionAnswers,
            };
        }),
    }));

    const submittedAt = options.submittedAt ?? new Date().toISOString();

    return {
        phases,
        flat_evaluations,
        attribute_registry: buildProductTestAttributeRegistry(snapshot),
        meta: {
            language: snapshot.language,
            totalAnswers: flat_evaluations.length,
            duration_seconds: options.durationSeconds ?? 0,
            submitted_at: submittedAt,
        },
    };
}

/** True when layer2 contains only taste-test sections (not product test). */
export function hasTasteTestLayer2Sections(survey: any): boolean {
    const sections = survey?.layer2_questions?.sections || [];
    return sections.some(
        (section: { module?: string }) =>
            section?.module && !PRODUCT_TEST_MODULE_IDS.has(section.module),
    );
}
