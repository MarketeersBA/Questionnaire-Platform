/**
 * Shared respondent navigation primitives.
 *
 * Granularity contract (in-flow navigation, not browser history):
 * - Taste test: brand-page steps (all questions for one brand on screen), plus optional overall step.
 * - Product test: intro/section wizard steps along the brand-first journey.
 */

export type NavigationDirection = 'forward' | 'back';

export interface NavigationBounds {
    canGoBack: boolean;
    canGoForward: boolean;
}

export type RespondentNavigationSurface = 'taste_test' | 'product_test';

/** Taste-test respondent cursor — one brand page (or overall) at a time. */
export interface TasteTestNavigationCursor {
    brandIndex: number;
}

export interface TasteTestNavigationPosition {
    brandIndex: number;
    totalBrandPages: number;
    totalSteps: number;
    hasOverallStep: boolean;
    isOverallStep: boolean;
    currentBrand: string | null;
    isFirstStep: boolean;
    isLastBrandPage: boolean;
    progressPercent: number;
}

export type TasteTestNavigationAdvance =
    | { type: 'brand'; brandIndex: number }
    | { type: 'overall' }
    | { type: 'complete' }
    | { type: 'boundary' };

/** Product-test respondent cursor — journey coordinates plus intro/section mode. */
export type ProductTestWizardMode = 'intro' | 'section';

export interface ProductTestNavigationCursor {
    phaseIndex: number;
    sectionIndex: number;
    wizardMode: ProductTestWizardMode;
}

export type ProductTestNavigationAdvance =
    | { type: 'section'; phaseIndex: number; sectionIndex: number; wizardMode: ProductTestWizardMode }
    | { type: 'intro'; phaseIndex: number; sectionIndex: number }
    | { type: 'complete' }
    | { type: 'boundary' };

export interface ProductTestNavigationPosition {
    cursor: ProductTestNavigationCursor;
    journeyStepIndex: number;
    totalJourneySteps: number;
    isFirstJourneyStep: boolean;
    isLastJourneyStep: boolean;
    progressPercent: number;
    bounds: NavigationBounds;
}
