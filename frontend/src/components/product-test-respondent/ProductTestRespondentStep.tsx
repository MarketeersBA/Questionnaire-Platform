import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductTestSnapshot } from '../../types/productTestRespondent';
import {
    findPendingFollowUpQuestionId,
    type FollowUpReplyChangeHandler,
    type FollowUpStateMap,
    type FollowUpTriggerHandler,
    type VoiceFollowUpTriggerHandler,
} from '../../utils/aiFollowup';
import type { ProductTestAnswers } from '../../utils/productTestFlowOrchestration';
import {
    advanceProductTestNavigation,
    applyProductTestNavigationAdvance,
    buildProductTestWizardJourney,
    getNextProductTestPhase,
    getProductTestWizardPosition,
    getVisibleProductTestQuestions,
    resolveJourneyStepIndex,
    resolveProductTestNavigationPosition,
    validateProductTestSection,
    type ProductTestWizardMode,
} from '../../utils/productTestFlowOrchestration';
import { collectProductTestSectionFollowUpScopeIds } from '../../utils/followUpNavigationSafety';
import { resolveProductTestDisplayText } from '../../utils/productTestPlaceholderEngine';
import { getProductTestPhaseIntro } from '../../utils/productTestPhaseIntro';
import type { ProductTestRespondentDisplayContext } from '../../utils/productTestRespondentDisplay';
import type { VoiceCaptureConfig } from '../../utils/voiceQuestions';
import ProductTestPhaseHeader from './ProductTestPhaseHeader';
import ProductTestSectionPanel from './ProductTestSectionPanel';

export type { ProductTestWizardMode };

interface ProductTestRespondentStepProps {
    snapshot: ProductTestSnapshot;
    language: 'en' | 'ar';
    loading?: boolean;
    answers: ProductTestAnswers;
    phaseIndex: number;
    sectionIndex: number;
    wizardMode: ProductTestWizardMode;
    onAnswersChange: (next: ProductTestAnswers) => void;
    onPhaseIndexChange: (index: number) => void;
    onSectionIndexChange: (index: number) => void;
    onWizardModeChange: (mode: ProductTestWizardMode) => void;
    onComplete: (finalAnswers: ProductTestAnswers) => void | Promise<void>;
    onBoundaryBack?: () => boolean;
    allowCrossPhaseBack?: boolean;
    display: ProductTestRespondentDisplayContext;
    publicToken?: string;
    voiceCapture?: VoiceCaptureConfig | null;
    aiFollowup?: any;
    onFollowUpTrigger?: FollowUpTriggerHandler;
    onVoiceFollowUpTrigger?: VoiceFollowUpTriggerHandler;
    followUpStateMap?: FollowUpStateMap;
    onFollowUpReplyChange?: FollowUpReplyChangeHandler;
    onFollowUpDismiss?: (questionIds: string[]) => void;
    onSuspendFollowUpsForScope?: (scopeQuestionIds: string[]) => void;
}

function resolveSectionBrandDisplay(
    section: { brand?: string; displayBrand?: string } | null | undefined,
    display: ProductTestRespondentDisplayContext,
): string | undefined {
    if (!section?.brand) return section?.displayBrand;
    return display.resolveBrandDisplay(section.brand);
}

export default function ProductTestRespondentStep({
    snapshot,
    language,
    loading = false,
    answers,
    phaseIndex,
    sectionIndex,
    wizardMode,
    onAnswersChange,
    onPhaseIndexChange,
    onSectionIndexChange,
    onWizardModeChange,
    onComplete,
    onBoundaryBack,
    allowCrossPhaseBack = false,
    display,
    publicToken,
    voiceCapture,
    aiFollowup,
    onFollowUpTrigger,
    onVoiceFollowUpTrigger,
    followUpStateMap,
    onFollowUpReplyChange,
    onFollowUpDismiss,
    onSuspendFollowUpsForScope,
}: ProductTestRespondentStepProps) {
    const isArabic = language === 'ar';
    const journey = useMemo(() => buildProductTestWizardJourney(snapshot), [snapshot]);
    const [pulseErrorId, setPulseErrorId] = useState<string | null>(null);

    const navigationCursor = useMemo(
        () => ({ phaseIndex, sectionIndex, wizardMode }),
        [phaseIndex, sectionIndex, wizardMode],
    );
    const navigationPosition = useMemo(
        () => resolveProductTestNavigationPosition(snapshot, navigationCursor, journey),
        [snapshot, navigationCursor, journey],
    );
    const canGoBack = navigationPosition.bounds.canGoBack || allowCrossPhaseBack;

    const sectionsPerPhase = useMemo(
        () => snapshot.phases.map((p) => p.sections.length),
        [snapshot.phases],
    );

    const phaseMeta = useMemo(
        () => snapshot.phases.map((p) => ({ timing: p.timing, label: p.label })),
        [snapshot.phases],
    );

    const position = getProductTestWizardPosition(snapshot, phaseIndex, sectionIndex, journey);
    const { phase, section } = position;
    const currentJourneyStep = journey[position.journeyStepIndex] ?? null;

    const activeSection = section ?? phase?.sections[sectionIndex] ?? phase?.sections[0];
    const brandDisplay = resolveSectionBrandDisplay(activeSection, display);
    const displaySectionTitle = activeSection
        ? resolveProductTestDisplayText(activeSection.title, {
            brand: activeSection.brand,
            displayBrand: activeSection.displayBrand,
            category: display.category,
            attribute: activeSection.title,
            language,
            testing_protocol: display.testing_protocol,
            blind_codes: display.blind_codes,
            brands: display.brands,
        })
        : undefined;

    const progressPercent = navigationPosition.progressPercent;

    useEffect(() => {
        setPulseErrorId(null);
    }, [phaseIndex, sectionIndex, wizardMode]);

    if (!phase) {
        return (
            <div className="text-center p-12 text-slate-500">
                {isArabic ? 'لا توجد أسئلة متاحة' : 'No product test questions available.'}
            </div>
        );
    }

    const handleContinue = async () => {
        if (wizardMode === 'intro') {
            const advance = advanceProductTestNavigation(snapshot, navigationCursor, 'forward', journey);
            const nextCursor = applyProductTestNavigationAdvance(navigationCursor, advance);
            if (!nextCursor) return;
            onWizardModeChange(nextCursor.wizardMode);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        if (!section) return;

        const issues = validateProductTestSection(answers, section, language, {
            requireHeatmapFollowUp: Boolean(aiFollowup?.is_enabled),
        });
        if (issues.length > 0) {
            const invalidQuestion = section.questions.find((question) => question.id === issues[0].questionId);
            const displayQuestionText = invalidQuestion
                ? resolveProductTestDisplayText(invalidQuestion.text, {
                    brand: section.brand || invalidQuestion.brand,
                    displayBrand: section.displayBrand || invalidQuestion.displayBrand,
                    category: display.category,
                    attribute: section.title,
                    language,
                    testing_protocol: display.testing_protocol,
                    blind_codes: display.blind_codes,
                    brands: display.brands,
                })
                : '';
            toast.error(
                displayQuestionText
                    ? isArabic
                        ? `يرجى الإجابة على: ${displayQuestionText}`
                        : `Please answer: ${displayQuestionText}`
                    : issues[0].message,
            );
            setPulseErrorId(issues[0].questionId);
            const el = document.getElementById(`pt-q-${issues[0].questionId}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const visibleQuestionIds = getVisibleProductTestQuestions(section, answers).map((q) => q.id);
        const pendingFollowUpQuestionId = findPendingFollowUpQuestionId(
            followUpStateMap,
            visibleQuestionIds,
        );
        if (pendingFollowUpQuestionId) {
            toast.error(
                isArabic
                    ? 'يرجى إكمال سؤال المتابعة الذكي قبل المتابعة'
                    : 'Please complete the AI follow-up before continuing',
            );
            setPulseErrorId(pendingFollowUpQuestionId);
            const el = document.getElementById(`pt-q-${pendingFollowUpQuestionId}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const advance = advanceProductTestNavigation(
            snapshot,
            navigationCursor,
            'forward',
            journey,
        );
        if (advance.type === 'complete') {
            await onComplete(answers);
            return;
        }

        const nextCursor = applyProductTestNavigationAdvance(navigationCursor, advance);
        if (!nextCursor) return;

        onPhaseIndexChange(nextCursor.phaseIndex);
        onSectionIndexChange(nextCursor.sectionIndex);
        onWizardModeChange(nextCursor.wizardMode);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBack = () => {
        if (wizardMode === 'section' && section) {
            onSuspendFollowUpsForScope?.(
                collectProductTestSectionFollowUpScopeIds(section, answers),
            );
        }

        const advance = advanceProductTestNavigation(snapshot, navigationCursor, 'back', journey);

        if (advance.type === 'boundary') {
            onBoundaryBack?.();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        const nextCursor = applyProductTestNavigationAdvance(navigationCursor, advance);
        if (!nextCursor) return;

        onPhaseIndexChange(nextCursor.phaseIndex);
        onSectionIndexChange(nextCursor.sectionIndex);
        onWizardModeChange(nextCursor.wizardMode);
        setPulseErrorId(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const continueLabel = (() => {
        if (wizardMode === 'intro') {
            if (currentJourneyStep?.journeyGroup === 'packaging') {
                return isArabic ? 'بدء تقييم التغليف' : 'Begin Packaging Evaluation';
            }
            if (currentJourneyStep?.timing === 'before_use' && brandDisplay) {
                return isArabic ? `بدء تقييم ${brandDisplay}` : `Begin ${brandDisplay} Evaluation`;
            }
            return isArabic ? 'بدء هذه المرحلة' : 'Begin This Phase';
        }
        if (position.isLastSection) {
            return isArabic ? 'إكمال التقييم' : 'Complete Evaluation';
        }
        const next = getNextProductTestPhase(snapshot, phaseIndex, sectionIndex, journey);
        if (next.type === 'section') {
            const nextStep = journey[
                resolveJourneyStepIndex(journey, next.phaseIndex, next.sectionIndex)
            ];
            if (nextStep?.journeyGroup === 'packaging') {
                return isArabic ? 'التعبئة والتغليف' : 'Packaging & Heatmap';
            }
            if (nextStep?.journeyGroup === 'brand_evaluation' && nextStep.brand !== currentJourneyStep?.brand) {
                const nextBrand = nextStep.brand
                    ? display.resolveBrandDisplay(nextStep.brand)
                    : '';
                return isArabic ? `العلامة التالية: ${nextBrand}` : `Next Brand: ${nextBrand}`;
            }
            if (nextStep && nextStep.timing !== currentJourneyStep?.timing) {
                const intro = getProductTestPhaseIntro(nextStep.timing, language, {
                    brandDisplay: nextStep.brand ? display.resolveBrandDisplay(nextStep.brand) : brandDisplay,
                    category: display.category,
                });
                return isArabic ? `التالي: ${intro.title}` : `Next: ${intro.title}`;
            }
        }
        return isArabic ? 'القسم التالي' : 'Next Section';
    })();

    return (
        <div className="space-y-10 overflow-visible">
            <ProductTestPhaseHeader
                timing={phase.timing}
                phaseLabel={phase.label}
                phaseIndex={phaseIndex}
                sectionIndex={sectionIndex}
                phases={phaseMeta}
                sectionsPerPhase={sectionsPerPhase}
                progressPercent={progressPercent}
                language={language}
                mode={wizardMode}
                sectionTitle={displaySectionTitle}
                brandDisplay={brandDisplay}
                category={display.category}
            />

            {wizardMode === 'section' && section && (
                <ProductTestSectionPanel
                    section={section}
                    answers={answers}
                    onAnswersChange={onAnswersChange}
                    language={language}
                    display={display}
                    publicToken={publicToken}
                    voiceCapture={voiceCapture}
                    pulseErrorId={pulseErrorId}
                    aiFollowup={aiFollowup}
                    onFollowUpTrigger={onFollowUpTrigger}
                    onVoiceFollowUpTrigger={onVoiceFollowUpTrigger}
                    followUpStateMap={followUpStateMap}
                    onFollowUpReplyChange={onFollowUpReplyChange}
                    onFollowUpDismiss={onFollowUpDismiss}
                />
            )}

            <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center gap-4">
                <button
                    type="button"
                    disabled={loading || !canGoBack}
                    onClick={handleBack}
                    className={`btn-secondary px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-0 ${canGoBack ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                    <ChevronLeft className="w-5 h-5" />
                    {isArabic ? 'السابق' : 'Previous'}
                </button>

                <button
                    type="button"
                    disabled={loading}
                    onClick={handleContinue}
                    className="btn-premium flex-1 py-5 rounded-2xl text-white font-black text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-3 disabled:opacity-50 shadow-premium-blue"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            {continueLabel}
                            <ChevronRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
