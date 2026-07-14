import type {
    NavigationBounds,
    NavigationDirection,
    TasteTestNavigationAdvance,
    TasteTestNavigationCursor,
    TasteTestNavigationPosition,
} from '../types/respondentNavigation';

interface TasteTestLayer2Section {
    title?: string;
    brand?: string | null;
    isBrandDynamic?: boolean;
    questions?: Array<{ text?: string; label?: string }>;
}

interface TasteTestSurveyLike {
    layer2_questions?: { sections?: TasteTestLayer2Section[] };
    customizations?: { brands?: string[]; category?: string };
}

function isPreferenceSection(section: TasteTestLayer2Section): boolean {
    const title = (section.title || '').toLowerCase();
    return (
        title.includes('preference')
        || title.includes('overall')
        || title.includes('تفضيل')
        || (section.questions ?? []).some((q) =>
            ((q.text || q.label || '').toLowerCase()).includes('prefer'),
        )
    );
}

function isExcludedBrandName(brand: string): boolean {
    const lower = brand.toLowerCase();
    return lower.includes('preference') || lower.includes('overall');
}

/** Ordered brand pages for taste-test layer2 (excludes preference/overall pseudo-brands). */
export function extractTasteTestBrandPages(survey: TasteTestSurveyLike | null | undefined): string[] {
    const sections = survey?.layer2_questions?.sections ?? [];
    const brands: string[] = [];

    for (const section of sections) {
        const brandSet = section.isBrandDynamic
            ? (
                survey?.customizations?.brands?.length
                    ? survey.customizations.brands
                    : [survey?.customizations?.category || 'Product']
            )
            : [section.brand].filter(Boolean) as string[];

        for (const brand of brandSet) {
            if (!brand || brands.includes(brand) || isExcludedBrandName(brand)) continue;
            brands.push(brand);
        }
    }

    return brands;
}

export function hasTasteTestOverallStep(survey: TasteTestSurveyLike | null | undefined): boolean {
    const sections = survey?.layer2_questions?.sections ?? [];
    return sections.some(isPreferenceSection);
}

export function resolveTasteTestNavigationPosition(
    cursor: TasteTestNavigationCursor,
    survey: TasteTestSurveyLike | null | undefined,
): TasteTestNavigationPosition {
    const brandPages = extractTasteTestBrandPages(survey);
    const hasOverall = hasTasteTestOverallStep(survey);
    const totalBrandPages = brandPages.length;
    const totalSteps = totalBrandPages + (hasOverall ? 1 : 0);
    const brandIndex = Math.max(0, Math.min(cursor.brandIndex, Math.max(totalSteps - 1, 0)));
    const isOverallStep = hasOverall && brandIndex >= totalBrandPages;

    return {
        brandIndex,
        totalBrandPages,
        totalSteps,
        hasOverallStep: hasOverall,
        isOverallStep,
        currentBrand: isOverallStep ? null : (brandPages[brandIndex] ?? null),
        isFirstStep: brandIndex === 0,
        isLastBrandPage: !isOverallStep && brandIndex >= Math.max(totalBrandPages - 1, 0),
        progressPercent: totalSteps > 0
            ? Math.min(100, Math.round(((brandIndex + 1) / totalSteps) * 100))
            : 0,
    };
}

export function resolveTasteTestNavigationBounds(
    cursor: TasteTestNavigationCursor,
    survey: TasteTestSurveyLike | null | undefined,
    options: { allowCrossPhaseBack?: boolean } = {},
): NavigationBounds {
    const position = resolveTasteTestNavigationPosition(cursor, survey);
    const canGoBack = !position.isFirstStep || Boolean(options.allowCrossPhaseBack);

    return {
        canGoBack,
        canGoForward: position.brandIndex < position.totalSteps - 1 || position.isOverallStep,
    };
}

export interface TasteTestRespondentNavigation {
    position: TasteTestNavigationPosition;
    bounds: NavigationBounds;
}

/** Unified taste-test navigation snapshot for respondent UI. */
export function resolveTasteTestRespondentNavigation(
    cursor: TasteTestNavigationCursor,
    survey: TasteTestSurveyLike | null | undefined,
    options: { allowCrossPhaseBack?: boolean } = {},
): TasteTestRespondentNavigation {
    const position = resolveTasteTestNavigationPosition(cursor, survey);
    return {
        position,
        bounds: resolveTasteTestNavigationBounds(cursor, survey, options),
    };
}

export function resolveTasteTestContinueLabel(
    position: TasteTestNavigationPosition,
    language: 'en' | 'ar',
): string {
    const isArabic = language === 'ar';
    if (position.isOverallStep) {
        return isArabic ? 'إكمال الاستبيان' : 'Complete Evaluation';
    }
    if (!position.isLastBrandPage) {
        return isArabic ? 'الماركة التالية' : 'Next Brand';
    }
    return position.hasOverallStep
        ? (isArabic ? 'متابعة التقييم' : 'Continue to Overall')
        : (isArabic ? 'إكمال الاستبيان' : 'Complete Evaluation');
}

/**
 * Compute the next cursor target for in-flow taste-test navigation.
 * Forward does not validate answers — callers gate submission separately.
 */
export function advanceTasteTestNavigation(
    cursor: TasteTestNavigationCursor,
    survey: TasteTestSurveyLike | null | undefined,
    direction: NavigationDirection,
): TasteTestNavigationAdvance {
    const position = resolveTasteTestNavigationPosition(cursor, survey);

    if (direction === 'back') {
        if (position.isFirstStep) return { type: 'boundary' };
        return { type: 'brand', brandIndex: position.brandIndex - 1 };
    }

    if (position.isOverallStep) {
        return { type: 'complete' };
    }

    if (position.isLastBrandPage) {
        return position.hasOverallStep
            ? { type: 'overall' }
            : { type: 'complete' };
    }

    return { type: 'brand', brandIndex: position.brandIndex + 1 };
}

export function applyTasteTestNavigationAdvance(
    advance: TasteTestNavigationAdvance,
    survey: TasteTestSurveyLike | null | undefined,
): TasteTestNavigationCursor | null {
    const totalBrandPages = extractTasteTestBrandPages(survey).length;

    if (advance.type === 'brand') {
        return { brandIndex: advance.brandIndex };
    }
    if (advance.type === 'overall') {
        return { brandIndex: totalBrandPages };
    }
    return null;
}

/** Whether a layer2 section should render on the current taste-test page. */
export function isTasteTestSectionVisible(
    section: TasteTestLayer2Section,
    position: TasteTestNavigationPosition,
    survey: TasteTestSurveyLike | null | undefined,
): boolean {
    const isPreference = isPreferenceSection(section);

    if (position.isOverallStep) {
        return isPreference;
    }

    if (isPreference) return false;

    const currentBrand = position.currentBrand;
    if (!currentBrand) return false;

    if ((section.title || '').toLowerCase().includes(currentBrand.toLowerCase())) {
        return true;
    }

    const otherBrands = (survey?.customizations?.brands ?? []).filter((b) => b !== currentBrand);
    if (otherBrands.some((b) => (section.title || '').toLowerCase().includes(b.toLowerCase()))) {
        return false;
    }

    const sectionBrands = section.isBrandDynamic
        ? (
            survey?.customizations?.brands?.length
                ? survey.customizations.brands
                : [survey?.customizations?.category || 'Product']
        )
        : [section.brand || null];

    return sectionBrands.includes(currentBrand);
}

/** Visible layer2 sections for the current taste-test page (dedupes overall preference sections). */
export function filterTasteTestVisibleSections(
    sections: TasteTestLayer2Section[],
    position: TasteTestNavigationPosition,
    survey: TasteTestSurveyLike | null | undefined,
): TasteTestLayer2Section[] {
    const renderedSections = new Set<string>();

    return sections.filter((section) => {
        if (!isTasteTestSectionVisible(section, position, survey)) return false;
        if (!position.isOverallStep) return true;

        const sectionTitle = (section.title || '').toLowerCase().trim();
        if (renderedSections.has(sectionTitle)) return false;
        renderedSections.add(sectionTitle);
        return true;
    });
}
