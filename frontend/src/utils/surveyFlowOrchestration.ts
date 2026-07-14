import type { ConfigurableModuleId, NextPhaseResult, PreviousPhaseResult, SurveyStep } from '../types/surveyFlow';
import { CONFIGURABLE_MODULE_IDS } from '../types/surveyFlow';
import type { QuestionModule } from '../types/questionModules';
import { isBrandPricingBehaviorEnabled } from './brandPricingBehaviorModuleUtils';
import { isBrandUsageEnabled } from './brandUsageModuleUtils';
import { buildPurchaseFunnelSubmissionPayload, isPurchaseFunnelEnabled, resolvePurchaseFunnelModule } from './purchaseFunnelModuleUtils';
import { resolveBrandPricingBehaviorModule } from './brandPricingBehaviorModuleUtils';
import { resolveBrandUsageModule } from './brandUsageModuleUtils';
import { isBrandAnalyzerEnabled, resolveBrandAnalyzerModule } from './brandAnalyzerModuleUtils';
import { hasTasteTestLayer2Sections, isProductTestEnabled } from './productTestFlowOrchestration';

export function resolveRuntimeModuleSequence(survey: any): string[] {
    return (
        survey?.module_sequence
        || survey?.config?.module_sequence
        || ['screening', 'taste_test', 'purchase_funnel']
    );
}

export function isConfigurableModuleId(value: string): value is ConfigurableModuleId {
    return (CONFIGURABLE_MODULE_IDS as string[]).includes(value);
}

export function isRuntimeModuleEnabled(survey: any, moduleId: string): boolean {
    switch (moduleId) {
        case 'screening':
            return true;
        case 'taste_test':
            return hasTasteTestLayer2Sections(survey);
        case 'product_test':
            return isProductTestEnabled(survey);
        case 'purchase_funnel':
            return isPurchaseFunnelEnabled(survey);
        case 'brand_usage':
            return isBrandUsageEnabled(survey);
        case 'brand_pricing_behavior':
            return isBrandPricingBehaviorEnabled(survey);
        case 'brand_analyzer':
            return isBrandAnalyzerEnabled(survey);
        default:
            return false;
    }
}

/**
 * Walk module_sequence after `currentModuleId` and return the next runnable phase.
 */
export function getNextPhaseStep(
    survey: any,
    currentModuleId: string,
    completedModules: Set<string> = new Set()
): NextPhaseResult {
    const sequence = resolveRuntimeModuleSequence(survey);
    const currentIndex = sequence.indexOf(currentModuleId);

    if (currentIndex === -1) {
        console.warn(
            `[NavGuard] Module "${currentModuleId}" not in sequence [${sequence.join(', ')}]. Submitting.`
        );
        return { type: 'submitAll' };
    }

    for (let i = currentIndex + 1; i < sequence.length; i++) {
        const nextMod = sequence[i];
        if (completedModules.has(nextMod)) continue;

        if (nextMod === 'taste_test' && isRuntimeModuleEnabled(survey, 'taste_test')) {
            return { type: 'layer2' };
        }
        if (nextMod === 'product_test' && isRuntimeModuleEnabled(survey, 'product_test')) {
            return { type: 'product_test' };
        }
        if (isConfigurableModuleId(nextMod) && isRuntimeModuleEnabled(survey, nextMod)) {
            return { type: 'module', moduleId: nextMod };
        }
    }

    return { type: 'submitAll' };
}

function resolveSequenceModuleForStep(
    step: SurveyStep,
    currentModuleId: ConfigurableModuleId | null,
): string | null {
    if (step === 'layer2') return 'taste_test';
    if (step === 'product_test') return 'product_test';
    if (step === 'module' && currentModuleId) return currentModuleId;
    if (step === 'layer1' || step === 'passed') return 'screening';
    return null;
}

/**
 * Walk module_sequence before the current respondent step and return the previous runnable phase.
 */
export function getPreviousPhaseStep(
    survey: any,
    step: SurveyStep,
    currentModuleId: ConfigurableModuleId | null = null,
): PreviousPhaseResult {
    const sequence = resolveRuntimeModuleSequence(survey);
    const currentModule = resolveSequenceModuleForStep(step, currentModuleId);
    if (!currentModule) return { type: 'boundary' };

    const currentIndex = sequence.indexOf(currentModule);
    if (currentIndex <= 0) {
        return currentModule === 'screening' ? { type: 'boundary' } : { type: 'boundary' };
    }

    for (let i = currentIndex - 1; i >= 0; i -= 1) {
        const previousMod = sequence[i];
        if (!isRuntimeModuleEnabled(survey, previousMod)) continue;

        if (previousMod === 'screening') return { type: 'layer1' };
        if (previousMod === 'taste_test') return { type: 'layer2' };
        if (previousMod === 'product_test') return { type: 'product_test' };
        if (isConfigurableModuleId(previousMod)) {
            return { type: 'module', moduleId: previousMod };
        }
    }

    return { type: 'boundary' };
}

export function canReturnToPreviousPublicPhase(
    survey: any,
    step: SurveyStep,
    currentModuleId: ConfigurableModuleId | null = null,
): boolean {
    return getPreviousPhaseStep(survey, step, currentModuleId).type !== 'boundary';
}

export async function resolveModuleDocument(
    moduleId: ConfigurableModuleId,
    survey: any
): Promise<QuestionModule> {
    switch (moduleId) {
        case 'purchase_funnel':
            return resolvePurchaseFunnelModule(survey);
        case 'brand_usage':
            return resolveBrandUsageModule(survey);
        case 'brand_pricing_behavior':
            return resolveBrandPricingBehaviorModule(survey);
        case 'brand_analyzer':
            return resolveBrandAnalyzerModule(survey);
        default:
            throw new Error(`Unknown module: ${moduleId}`);
    }
}

export async function resolveEnabledModuleDocuments(
    survey: any
): Promise<Partial<Record<ConfigurableModuleId, QuestionModule>>> {
    const docs: Partial<Record<ConfigurableModuleId, QuestionModule>> = {};
    const enabled = CONFIGURABLE_MODULE_IDS.filter((id) => isRuntimeModuleEnabled(survey, id));

    await Promise.all(
        enabled.map(async (moduleId) => {
            docs[moduleId] = await resolveModuleDocument(moduleId, survey);
        })
    );

    return docs;
}

export function getModulePlaceholderCategory(survey: any, moduleId: ConfigurableModuleId): string {
    if (moduleId === 'purchase_funnel') {
        return (
            survey?.purchase_funnel?.category_name
            || survey?.customizations?.category
            || survey?.config?.category
            || 'Product'
        );
    }
    return survey?.customizations?.category || survey?.config?.category || 'Product';
}

/** Merge module answers + legacy PF aliases for analytics pipelines. */
export function buildStructuredModuleSubmission(
    moduleAnswers: Record<string, Record<string, unknown>>
) {
    const pfRaw = moduleAnswers.purchase_funnel || {};
    const pfPayload = buildPurchaseFunnelSubmissionPayload(pfRaw);

    return {
        topLevel: { ...pfPayload },
        structured: {
            module_answers: { ...moduleAnswers },
            purchase_funnel: pfPayload,
        },
    };
}

/** Map legacy persisted step values to the generic module step. */
export function normalizePersistedStep(
    step: string | undefined,
    currentModuleId?: string | null
): { step: string; currentModuleId: ConfigurableModuleId | null } {
    if (step === 'funnel') {
        return { step: 'module', currentModuleId: 'purchase_funnel' };
    }
    if (step === 'product_test') {
        return { step: 'product_test', currentModuleId: null };
    }
    if (step === 'module' && currentModuleId && isConfigurableModuleId(currentModuleId)) {
        return { step: 'module', currentModuleId };
    }
    return { step: step || 'layer1', currentModuleId: null };
}
