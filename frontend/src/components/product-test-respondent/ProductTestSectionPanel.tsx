import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ProductTestRespondentSection } from '../../types/productTestRespondent';
import {
    getVisibleProductTestQuestions,
    reconcileHiddenConditionalAnswers,
    type ProductTestAnswers,
} from '../../utils/productTestFlowOrchestration';
import { resolveProductTestDisplayText } from '../../utils/productTestPlaceholderEngine';
import type { ProductTestRespondentDisplayContext } from '../../utils/productTestRespondentDisplay';
import type { VoiceCaptureConfig } from '../../utils/voiceQuestions';
import type { FollowUpReplyChangeHandler, FollowUpStateMap, FollowUpTriggerHandler, VoiceFollowUpTriggerHandler } from '../../utils/aiFollowup';
import ProductTestQuestionRenderer from './ProductTestQuestionRenderer';

interface ProductTestSectionPanelProps {
    section: ProductTestRespondentSection;
    answers: ProductTestAnswers;
    onAnswersChange: (next: ProductTestAnswers) => void;
    language: 'en' | 'ar';
    display: ProductTestRespondentDisplayContext;
    publicToken?: string;
    voiceCapture?: VoiceCaptureConfig | null;
    pulseErrorId?: string | null;
    aiFollowup?: any;
    onFollowUpTrigger?: FollowUpTriggerHandler;
    onVoiceFollowUpTrigger?: VoiceFollowUpTriggerHandler;
    followUpStateMap?: FollowUpStateMap;
    onFollowUpReplyChange?: FollowUpReplyChangeHandler;
    onFollowUpDismiss?: (questionIds: string[]) => void;
}

export default function ProductTestSectionPanel({
    section,
    answers,
    onAnswersChange,
    language,
    display,
    publicToken,
    voiceCapture,
    pulseErrorId,
    aiFollowup,
    onFollowUpTrigger,
    onVoiceFollowUpTrigger,
    followUpStateMap,
    onFollowUpReplyChange,
    onFollowUpDismiss,
}: ProductTestSectionPanelProps) {
    const isArabic = language === 'ar';
    const brandKey = section.brand;
    const brandDisplay = brandKey
        ? display.resolveBrandDisplay(brandKey)
        : (section.displayBrand || '');

    const sectionTitle = resolveProductTestDisplayText(section.title, {
        brand: brandKey,
        displayBrand: section.displayBrand,
        category: display.category,
        attribute: section.title,
        language,
        testing_protocol: display.testing_protocol,
        blind_codes: display.blind_codes,
        brands: display.brands,
    });

    const visibleQuestions = getVisibleProductTestQuestions(section, answers);

    const branchingControllerIds = useMemo(() => {
        const ids = new Set<string>();
        for (const question of section.questions) {
            const dependsOn = question.visibilityCondition?.dependsOnQuestionId;
            if (dependsOn) ids.add(dependsOn);
        }
        return ids;
    }, [section.questions]);

    const handleQuestionChange = (questionId: string, nextValue: unknown) => {
        const merged = { ...answers, [questionId]: nextValue };
        if (!branchingControllerIds.has(questionId)) {
            onAnswersChange(merged);
            return;
        }

        const { answers: reconciled, clearedQuestionIds } = reconcileHiddenConditionalAnswers(section, merged);
        if (clearedQuestionIds.length > 0) {
            onFollowUpDismiss?.(clearedQuestionIds);
        }
        onAnswersChange(reconciled);
    };

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={section.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
            >
                {brandDisplay && (
                    <div className="flex flex-wrap items-center gap-2 px-1">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                            {isArabic ? 'تقييم:' : 'Evaluating:'}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            {brandDisplay}
                        </span>
                    </div>
                )}

                {sectionTitle !== section.title && (
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 px-1">
                        {sectionTitle}
                    </p>
                )}

                <div className="space-y-8">
                    {visibleQuestions.map((question) => (
                        <ProductTestQuestionRenderer
                            key={question.id}
                            question={question}
                            section={section}
                            value={answers[question.id]}
                            onChange={(next) => handleQuestionChange(question.id, next)}
                            language={language}
                            display={display}
                            publicToken={publicToken}
                            voiceCapture={voiceCapture}
                            pulseError={pulseErrorId === question.id}
                            aiFollowup={aiFollowup}
                            onFollowUpTrigger={onFollowUpTrigger}
                            onVoiceFollowUpTrigger={onVoiceFollowUpTrigger}
                            followUpStateMap={followUpStateMap}
                            onFollowUpReplyChange={onFollowUpReplyChange}
                            onFollowUpDismiss={onFollowUpDismiss}
                        />
                    ))}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
