import type {
    ProductTestConfig,
    ProductTestQuestion,
    PackageTestQuestion,
} from '../types/productTest';
import type {
    ProductTestBrandContext,
    ProductTestBrandContextInput,
    ProductTestRespondentPhase,
    ProductTestRespondentQuestion,
    ProductTestRespondentSection,
    ProductTestSnapshot,
    ProductTestTimingPhase,
} from '../types/productTestRespondent';
import { PRODUCT_TEST_TIMING_PHASES } from '../types/productTestRespondent';
import type { QuestionMeta } from '../types/tasteTest';
import {
    applyProductTestPlaceholders,
    buildBrandScopedQuestionId,
    buildProductTestBrandContext,
    resolveBrandDisplayName,
} from './productTestPlaceholderEngine';
import {
    buildPackagingHeatmapSnapshotMeta,
    composePackagingPhase,
    enrichSnapshotWithPackagingHeatmapMeta,
} from './packagingHeatmapSnapshot';
import {
    appendTrialMediaCaptureToPhases,
    buildTrialMediaCaptureSnapshotMeta,
    enrichSnapshotWithTrialMediaCaptureMeta,
} from './trialMediaCaptureSnapshot';
import { applyRecommendVisibilityConditions } from './productTestRecommendVisibility';

/** Bank timing labels → canonical phase slugs. */
export const BANK_TIMING_TO_PHASE: Record<string, ProductTestTimingPhase> = {
    'Before Use': 'before_use',
    'During Use': 'during_use',
    'After Use': 'after_use',
};

const PHASE_LABELS: Record<ProductTestTimingPhase, { en: string; ar: string }> = {
    before_use: { en: 'Before Use', ar: 'قبل الاستخدام' },
    during_use: { en: 'During Use', ar: 'أثناء الاستخدام' },
    after_use: { en: 'After Use', ar: 'بعد الاستخدام' },
    packaging: { en: 'Packaging & Presentation', ar: 'التعبئة والتغليف' },
};

const GROUP_NAME_TRANSLATIONS: Record<string, string> = {
    'Product Appearance': 'مظهر المنتج',
    'Preparation & Usage': 'التحضير والاستخدام',
    'Core Performance': 'الأداء الأساسي',
    'Sensory & After-Use Experience': 'الحسية وتجربة ما بعد الاستخدام',
    'Convenience & Practicality': 'الراحة والعملية',
};

const STANDALONE_SECTION_ID = 'overall_product_evaluation';
const PACKAGING_SECTION_ID = 'packaging_presentation';
const PREFERENCE_SECTION_ID = 'product_preference';

export function bankTimingToPhase(timing: string | null | undefined): ProductTestTimingPhase {
    if (!timing) return 'before_use';
    return BANK_TIMING_TO_PHASE[timing] ?? 'before_use';
}

export function phaseLabel(phase: ProductTestTimingPhase, language: 'en' | 'ar'): string {
    return PHASE_LABELS[phase][language];
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 64) || 'section';
}

function questionSortKey(id: string): number {
    return parseInt(id.replace(/\D/g, ''), 10) || 0;
}

function translateGroupName(name: string, isArabic: boolean): string {
    if (!isArabic) return name;
    return GROUP_NAME_TRANSLATIONS[name] ?? name;
}

function isProductQuestionEnabled(q: ProductTestQuestion, config: ProductTestConfig): boolean {
    if (q.question_status === 'fixed') return true;
    if (config.fixed_questions?.includes(q.question_id)) return true;
    if (config.optional_questions?.includes(q.question_id)) return true;
    if (config.selected_attributes?.includes(q.attribute)) return true;
    if (q.parent_attribute && config.selected_attributes?.includes(q.parent_attribute)) return true;
    return false;
}

function isPackageQuestionEnabled(q: PackageTestQuestion, config: ProductTestConfig): boolean {
    if (!config.package_test_enabled) return false;
    if (!config.package_test_attributes?.length) return true;
    return config.package_test_attributes.includes(q.attribute);
}

function placeholderCtx(
    brand: string,
    brandContext: ProductTestBrandContext,
    language: 'en' | 'ar',
    attribute = '',
) {
    return {
        brand,
        category: brandContext.category,
        attribute,
        language,
        testing_protocol: brandContext.testing_protocol,
        blind_codes: brandContext.blind_codes,
    };
}

function localizeWithBrandPlaceholders(
    text: string,
    brand: string,
    brandContext: ProductTestBrandContext,
    language: 'en' | 'ar',
    attribute = '',
): string {
    return applyProductTestPlaceholders(text, placeholderCtx(brand, brandContext, language, attribute));
}

export function mapBankQuestionToRespondent(
    q: ProductTestQuestion | PackageTestQuestion,
    language: 'en' | 'ar',
    phase: ProductTestTimingPhase,
): ProductTestRespondentQuestion {
    const isArabic = language === 'ar';
    const text = isArabic ? (q.ar_text || q.en_text) : q.en_text;
    const rawOptions = isArabic ? q.ar_options : q.en_options;

    const qTypeStr = (q.question_type || '').toLowerCase();
    const isScale = qTypeStr.includes('scale');
    const isNumeric = qTypeStr.includes('numeric');
    const isBipolar = qTypeStr.includes('bipolar');
    const isOpenEnded = qTypeStr.includes('open-end') || qTypeStr.includes('text');

    let extractedScaleMax = 5;
    const scaleMatch = qTypeStr.match(/(\d+)-(\d+)/);
    if (scaleMatch?.[2]) {
        extractedScaleMax = parseInt(scaleMatch[2], 10);
    } else if (qTypeStr.includes('10')) {
        extractedScaleMax = 10;
    }

    let options: string[] = Array.isArray(rawOptions) ? rawOptions : [];
    if (typeof rawOptions === 'string') {
        options = rawOptions.split(',').map((o) => o.trim());
    }

    let finalType = 'mcq';
    if (isOpenEnded) finalType = 'open-ended';
    else if (isNumeric) finalType = 'number';
    else if (isScale) finalType = 'scale';
    else if (isBipolar) finalType = 'bipolar';

    if (finalType === 'mcq' && options.length === 1 && options[0].toLowerCase() === 'open-end') {
        finalType = 'open-ended';
    }
    if (finalType === 'open-ended') {
        options = [];
    }

    let minLabel = '';
    let maxLabel = '';
    if (typeof rawOptions === 'string' && rawOptions.includes('=')) {
        const parts = rawOptions.split(',').map((o) => o.trim());
        parts.forEach((p) => {
            const labelMatch = p.split('=')[1]?.trim();
            if (p.startsWith('1=')) minLabel = minLabel || labelMatch || '';
            if (p.startsWith(`${extractedScaleMax}=`) || (p.includes('=') && parts.indexOf(p) === parts.length - 1)) {
                maxLabel = maxLabel || labelMatch || '';
            }
        });
    }

    const diagnosticTag = 'diagnostic_tag' in q ? (q.diagnostic_tag ?? null) : null;

    return {
        id: q.question_id,
        text,
        type: finalType,
        options,
        required: true,
        timing: phase,
        diagnostic_tag: diagnosticTag,
        questionMeta: {
            nature: q.question_status === 'fixed' ? 'fixed' : 'dynamic',
            inputType:
                finalType === 'open-ended'
                    ? 'open-ended'
                    : isNumeric
                      ? 'numeric'
                      : isScale
                        ? 'scale'
                        : isBipolar
                          ? 'bipolar'
                          : 'single-choice',
            options,
            scaleMax: isScale ? extractedScaleMax : undefined,
            minLabel: minLabel || undefined,
            maxLabel: maxLabel || undefined,
            bipolarLeft: isBipolar ? minLabel : undefined,
            bipolarRight: isBipolar ? maxLabel : undefined,
            canonicalQuestionId: q.question_id,
            diagnostic_tag: diagnosticTag,
        } as QuestionMeta,
    };
}

function applyBrandScopeToQuestion(
    mapped: ProductTestRespondentQuestion,
    bankQuestionId: string,
    brand: string,
    brandContext: ProductTestBrandContext,
    sectionTitle: string,
    language: 'en' | 'ar',
): ProductTestRespondentQuestion {
    const displayBrand = resolveBrandDisplayName(brand, brandContext);
    return {
        ...mapped,
        id: buildBrandScopedQuestionId(brand, bankQuestionId),
        canonicalQuestionId: bankQuestionId,
        brand,
        displayBrand,
        text: localizeWithBrandPlaceholders(mapped.text, brand, brandContext, language, sectionTitle),
    };
}

function sortQuestions(questions: ProductTestRespondentQuestion[]): ProductTestRespondentQuestion[] {
    return [...questions].sort((a, b) => questionSortKey(a.id) - questionSortKey(b.id));
}

function buildSectionsForPhase(
    phase: ProductTestTimingPhase,
    enabledQuestions: ProductTestQuestion[],
    language: 'en' | 'ar',
    brand?: string,
    brandContext?: ProductTestBrandContext | null,
): ProductTestRespondentSection[] {
    const isArabic = language === 'ar';
    const phaseQuestions = enabledQuestions.filter(
        (q) => bankTimingToPhase(q.timing) === phase,
    );

    const groupMap: Record<string, { bankId: string; bankQuestion: ProductTestQuestion; question: ProductTestRespondentQuestion }[]> = {};
    const standaloneQs: { bankId: string; bankQuestion: ProductTestQuestion; question: ProductTestRespondentQuestion }[] = [];

    phaseQuestions.forEach((q) => {
        const mapped = mapBankQuestionToRespondent(q, language, phase);
        const entry = { bankId: q.question_id, bankQuestion: q, question: mapped };
        if (q.parent_attribute) {
            if (!groupMap[q.parent_attribute]) groupMap[q.parent_attribute] = [];
            groupMap[q.parent_attribute].push(entry);
        } else if (q.attribute_type === 'main') {
            if (!groupMap[q.attribute]) groupMap[q.attribute] = [];
            groupMap[q.attribute].push(entry);
        } else {
            standaloneQs.push(entry);
        }
    });

    const sections: ProductTestRespondentSection[] = [];
    const brandSlug = brand ? slugify(brand) : '';

    Object.entries(groupMap).forEach(([groupName, entries]) => {
        const rawTitle = translateGroupName(groupName, isArabic);
        const title = brand && brandContext
            ? localizeWithBrandPlaceholders(rawTitle, brand, brandContext, language, groupName)
            : rawTitle;

        const scopedEntries = entries.map(({ bankId, bankQuestion, question }) => ({
            bankId,
            bankQuestion,
            question: brand && brandContext
                ? applyBrandScopeToQuestion(question, bankId, brand, brandContext, groupName, language)
                : question,
        }));

        sections.push({
            id: brand
                ? `${phase}_${brandSlug}_${slugify(groupName)}`
                : `${phase}_${slugify(groupName)}`,
            title,
            module: 'product_test',
            timing: phase,
            brand,
            displayBrand: brand && brandContext
                ? resolveBrandDisplayName(brand, brandContext)
                : undefined,
            questions: applyRecommendVisibilityConditions(
                sortQuestions(scopedEntries.map((entry) => entry.question)),
                scopedEntries.map((entry) => ({
                    bankId: entry.bankId,
                    bankQuestion: entry.bankQuestion,
                    language,
                })),
            ),
        });
    });

    if (standaloneQs.length > 0) {
        const rawStandalone = isArabic ? 'التقييم العام للمنتج' : 'Overall Product Evaluation';
        const title = brand && brandContext
            ? localizeWithBrandPlaceholders(rawStandalone, brand, brandContext, language)
            : rawStandalone;

        const scopedStandalone = standaloneQs.map(({ bankId, bankQuestion, question }) => ({
            bankId,
            bankQuestion,
            question: brand && brandContext
                ? applyBrandScopeToQuestion(question, bankId, brand, brandContext, title, language)
                : question,
        }));

        sections.push({
            id: brand
                ? `${phase}_${brandSlug}_${STANDALONE_SECTION_ID}`
                : `${phase}_${STANDALONE_SECTION_ID}`,
            title,
            module: 'product_test',
            timing: phase,
            brand,
            displayBrand: brand && brandContext
                ? resolveBrandDisplayName(brand, brandContext)
                : undefined,
            questions: applyRecommendVisibilityConditions(
                sortQuestions(scopedStandalone.map((entry) => entry.question)),
                scopedStandalone.map((entry) => ({
                    bankId: entry.bankId,
                    bankQuestion: entry.bankQuestion,
                    language,
                })),
            ),
        });
    }

    return sections;
}

/**
 * Packaging evaluates pack design — brand-agnostic in v1 (not looped per brand).
 * Package questions reference the physical pack, not a specific test brand identity.
 */
function buildPackagingPhase(
    config: ProductTestConfig,
    packageQuestions: PackageTestQuestion[],
    language: 'en' | 'ar',
): ProductTestRespondentPhase | null {
    if (!config.package_test_enabled) return null;

    const enabled = packageQuestions.filter((q) => isPackageQuestionEnabled(q, config));
    if (enabled.length === 0) return null;

    const isArabic = language === 'ar';
    const mapped = sortQuestions(
        enabled.map((q) => mapBankQuestionToRespondent(q, language, 'packaging')),
    );

    return {
        timing: 'packaging',
        label: phaseLabel('packaging', language),
        sections: [
            {
                id: PACKAGING_SECTION_ID,
                title: isArabic ? 'تقييم التعبئة والتغليف' : 'Packaging & Presentation Evaluation',
                module: 'package_test',
                timing: 'packaging',
                questions: applyRecommendVisibilityConditions(mapped),
            },
        ],
    };
}

function buildPreferenceSection(
    brands: string[],
    brandContext: ProductTestBrandContext,
    language: 'en' | 'ar',
): ProductTestRespondentSection {
    const displayOptions = brands.map((b) => resolveBrandDisplayName(b, brandContext));
    return {
        id: PREFERENCE_SECTION_ID,
        title: language === 'ar' ? 'التفضيل' : 'Preference',
        module: 'product_test',
        timing: 'after_use',
        questions: [{
            id: 'pt_overall_preference',
            text: language === 'ar' ? 'أي منتج تفضله أكثر؟' : 'Which product did you prefer the most?',
            type: 'mcq',
            options: displayOptions,
            required: true,
            timing: 'after_use',
            diagnostic_tag: null,
            questionMeta: {
                nature: 'fixed',
                inputType: 'single-choice',
                options: displayOptions,
                brandOptions: brands,
                canonicalQuestionId: 'pt_overall_preference',
            } as QuestionMeta,
        }],
    };
}

function computeSnapshotMeta(
    phases: ProductTestRespondentPhase[],
    brandCount: number,
    generatedAt: string,
) {
    const sectionCount = phases.reduce((sum, p) => sum + p.sections.length, 0);
    const totalQuestions = phases.reduce(
        (sum, p) => sum + p.sections.reduce((s, sec) => s + sec.questions.length, 0),
        0,
    );
    const productQuestionCount = phases
        .filter((p) => p.timing !== 'packaging')
        .reduce(
            (sum, p) => sum + p.sections.reduce((s, sec) => s + sec.questions.length, 0),
            0,
        );
    const preferenceCount = brandCount > 1 ? 1 : 0;
    const perBrandDenominator = brandCount > 0 ? brandCount : 1;
    const questionsPerBrand = brandCount > 0
        ? Math.round((productQuestionCount - preferenceCount) / perBrandDenominator)
        : totalQuestions;

    return {
        totalQuestions,
        sectionCount,
        phaseCount: phases.length,
        generatedAt,
        brandCount,
        questionsPerBrand,
    };
}

/** Build the full immutable product test snapshot from bank + config. */
export function buildProductTestSnapshot(
    config: ProductTestConfig,
    productQuestions: ProductTestQuestion[],
    packageQuestions: PackageTestQuestion[] = [],
    generatedAt: string = new Date().toISOString(),
    brandContextInput?: ProductTestBrandContextInput | null,
): ProductTestSnapshot {
    const language = config.language || 'en';
    const enabledProductQs = productQuestions.filter((q) => isProductQuestionEnabled(q, config));
    const brandContext = brandContextInput
        ? buildProductTestBrandContext(brandContextInput)
        : null;
    const brands = brandContext?.brands ?? [];

    const phases: ProductTestRespondentPhase[] = [];

    if (brands.length === 0) {
        for (const phase of PRODUCT_TEST_TIMING_PHASES) {
            if (phase === 'packaging') continue;
            const sections = buildSectionsForPhase(phase, enabledProductQs, language);
            if (sections.length === 0) continue;
            phases.push({
                timing: phase,
                label: phaseLabel(phase, language),
                sections,
            });
        }
    } else {
        for (const phase of PRODUCT_TEST_TIMING_PHASES) {
            if (phase === 'packaging') continue;
            const phaseSections: ProductTestRespondentSection[] = [];
            for (const brand of brands) {
                phaseSections.push(
                    ...buildSectionsForPhase(phase, enabledProductQs, language, brand, brandContext),
                );
            }
            if (phaseSections.length > 0) {
                phases.push({
                    timing: phase,
                    label: phaseLabel(phase, language),
                    sections: phaseSections,
                });
            }
        }

        if (brands.length > 1 && brandContext) {
            const afterPhase = phases.find((p) => p.timing === 'after_use');
            if (afterPhase) {
                afterPhase.sections.push(buildPreferenceSection(brands, brandContext, language));
            }
        }
    }

    const packagingPhase = buildPackagingPhase(config, packageQuestions, language);
    const composedPackaging = composePackagingPhase(
        config,
        packagingPhase,
        brandContext,
        language,
    );
    if (composedPackaging) {
        phases.push(composedPackaging);
    }

    const phasesWithTrialMedia = appendTrialMediaCaptureToPhases(phases, config, language);

    const hmMeta = buildPackagingHeatmapSnapshotMeta(config);
    const tmMeta = buildTrialMediaCaptureSnapshotMeta(config);
    const meta = computeSnapshotMeta(phasesWithTrialMedia, brands.length, generatedAt);
    if (hmMeta) {
        meta.packaging_heatmap = hmMeta;
    }
    if (tmMeta) {
        meta.trial_media_capture = tmMeta;
    }

    const snapshot: ProductTestSnapshot = {
        version: 1,
        language,
        phases: phasesWithTrialMedia,
        meta,
        brand_context: brandContext && brands.length > 0 ? brandContext : undefined,
    };

    return enrichSnapshotWithTrialMediaCaptureMeta(
        enrichSnapshotWithPackagingHeatmapMeta(snapshot, config),
        config,
    );
}

/** Flatten snapshot phases into legacy L2-style sections (preview / migration). */
export function flattenSnapshotToLegacySections(
    snapshot: ProductTestSnapshot,
): Array<{
    title: string;
    module: string;
    brand?: string;
    displayBrand?: string;
    questions: ProductTestRespondentQuestion[];
}> {
    return snapshot.phases.flatMap((phase) =>
        phase.sections.map((section) => ({
            title: section.title,
            module: section.module,
            brand: section.brand,
            displayBrand: section.displayBrand,
            questions: section.questions,
        })),
    );
}

/**
 * Extract product_test_snapshot from legacy template_snapshot_l2 sections.
 * Used when migrating surveys created before the dedicated snapshot field existed.
 */
export function migrateLegacyL2ToProductTestSnapshot(
    l2Content: { sections?: Array<Record<string, unknown>> } | null | undefined,
    language: 'en' | 'ar' = 'en',
): ProductTestSnapshot | null {
    const sections = l2Content?.sections || [];
    const ptSections = sections.filter((s) => {
        const mod = s.module as string | undefined;
        return mod === 'product_test' || mod === 'package_test' || mod === 'packaging_heatmap'
            || mod === 'trial_media_capture';
    });

    if (ptSections.length === 0) return null;

    const phaseMap = new Map<ProductTestTimingPhase, ProductTestRespondentSection[]>();

    ptSections.forEach((rawSection) => {
        const module = (rawSection.module as ProductTestRespondentSection['module']) || 'product_test';
        const questions = (rawSection.questions as Array<Record<string, unknown>>) || [];
        const defaultPhase: ProductTestTimingPhase =
            module === 'package_test' || module === 'packaging_heatmap' ? 'packaging' : 'before_use';

        const phaseBuckets = new Map<ProductTestTimingPhase, ProductTestRespondentQuestion[]>();
        questions.forEach((q) => {
            const bankTiming = q.timing as string | undefined;
            const phase =
                module === 'package_test' || module === 'packaging_heatmap'
                    ? 'packaging'
                    : module === 'trial_media_capture'
                        ? (bankTiming as ProductTestTimingPhase) || 'after_use'
                        : bankTimingToPhase(bankTiming);
            const respondentQ = q as unknown as ProductTestRespondentQuestion;
            respondentQ.timing = phase;
            if (!phaseBuckets.has(phase)) phaseBuckets.set(phase, []);
            phaseBuckets.get(phase)!.push(respondentQ);
        });

        phaseBuckets.forEach((qs, phase) => {
            const sectionId =
                module === 'package_test'
                    ? PACKAGING_SECTION_ID
                    : `${phase}_${slugify(String(rawSection.title || 'section'))}`;

            const section: ProductTestRespondentSection = {
                id: sectionId,
                title: String(rawSection.title || 'Section'),
                module,
                timing: phase,
                brand: rawSection.brand as string | undefined,
                displayBrand: rawSection.displayBrand as string | undefined,
                questions: applyRecommendVisibilityConditions(sortQuestions(qs)),
            };

            if (!phaseMap.has(phase)) phaseMap.set(phase, []);
            phaseMap.get(phase)!.push(section);
        });

        if (questions.length === 0 && module === 'package_test') {
            if (!phaseMap.has(defaultPhase)) phaseMap.set(defaultPhase, []);
            phaseMap.get(defaultPhase)!.push({
                id: PACKAGING_SECTION_ID,
                title: String(rawSection.title || 'Packaging'),
                module,
                timing: 'packaging',
                questions: [],
            });
        }
    });

    const orderedPhases = PRODUCT_TEST_TIMING_PHASES.filter((p) => phaseMap.has(p));
    if (orderedPhases.length === 0) return null;

    const phases: ProductTestRespondentPhase[] = orderedPhases.map((phase) => ({
        timing: phase,
        label: phaseLabel(phase, language),
        sections: phaseMap.get(phase) || [],
    }));

    const generatedAt = new Date().toISOString();
    const meta = computeSnapshotMeta(phases, 0, generatedAt);

    return {
        version: 1,
        language,
        phases,
        meta,
    };
}
