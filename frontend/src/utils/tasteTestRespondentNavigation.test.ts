import { describe, expect, it } from 'vitest';
import {
    advanceTasteTestNavigation,
    applyTasteTestNavigationAdvance,
    extractTasteTestBrandPages,
    filterTasteTestVisibleSections,
    hasTasteTestOverallStep,
    resolveTasteTestContinueLabel,
    resolveTasteTestNavigationBounds,
    resolveTasteTestNavigationPosition,
    resolveTasteTestRespondentNavigation,
} from './tasteTestRespondentNavigation';

const SURVEY_WITH_OVERALL = {
    customizations: { brands: ['BrandA', 'BrandB'] },
    layer2_questions: {
        sections: [
            {
                title: 'BrandA Taste',
                brand: 'BrandA',
                questions: [{ id: 'q1', text: 'How sweet?', required: true }],
            },
            {
                title: 'BrandB Taste',
                brand: 'BrandB',
                questions: [{ id: 'q1', text: 'How sweet?', required: true }],
            },
            {
                title: 'Overall Preference',
                questions: [{ id: 'pref', text: 'Which do you prefer?', required: true }],
            },
        ],
    },
};

describe('tasteTestRespondentNavigation', () => {
    it('extracts brand pages excluding preference/overall pseudo-brands', () => {
        expect(extractTasteTestBrandPages(SURVEY_WITH_OVERALL)).toEqual(['BrandA', 'BrandB']);
        expect(hasTasteTestOverallStep(SURVEY_WITH_OVERALL)).toBe(true);
    });

    it('resolves brand and overall positions from cursor', () => {
        const brandPosition = resolveTasteTestNavigationPosition({ brandIndex: 1 }, SURVEY_WITH_OVERALL);
        expect(brandPosition.currentBrand).toBe('BrandB');
        expect(brandPosition.isOverallStep).toBe(false);
        expect(brandPosition.isLastBrandPage).toBe(true);

        const overallPosition = resolveTasteTestNavigationPosition({ brandIndex: 2 }, SURVEY_WITH_OVERALL);
        expect(overallPosition.isOverallStep).toBe(true);
        expect(overallPosition.currentBrand).toBeNull();
    });

    it('advances forward through brands then overall then complete', () => {
        let cursor = { brandIndex: 0 };

        const first = advanceTasteTestNavigation(cursor, SURVEY_WITH_OVERALL, 'forward');
        expect(first).toEqual({ type: 'brand', brandIndex: 1 });
        cursor = applyTasteTestNavigationAdvance(first, SURVEY_WITH_OVERALL)!;

        const second = advanceTasteTestNavigation(cursor, SURVEY_WITH_OVERALL, 'forward');
        expect(second).toEqual({ type: 'overall' });
        cursor = applyTasteTestNavigationAdvance(second, SURVEY_WITH_OVERALL)!;

        const third = advanceTasteTestNavigation(cursor, SURVEY_WITH_OVERALL, 'forward');
        expect(third).toEqual({ type: 'complete' });
    });

    it('retreats one brand page at a time', () => {
        const advance = advanceTasteTestNavigation({ brandIndex: 1 }, SURVEY_WITH_OVERALL, 'back');
        expect(advance).toEqual({ type: 'brand', brandIndex: 0 });

        const boundary = advanceTasteTestNavigation({ brandIndex: 0 }, SURVEY_WITH_OVERALL, 'back');
        expect(boundary).toEqual({ type: 'boundary' });
    });

    it('reports navigation bounds for first and later steps', () => {
        expect(resolveTasteTestNavigationBounds({ brandIndex: 0 }, SURVEY_WITH_OVERALL)).toEqual({
            canGoBack: false,
            canGoForward: true,
        });
        expect(resolveTasteTestNavigationBounds({ brandIndex: 1 }, SURVEY_WITH_OVERALL).canGoBack).toBe(true);
    });

    it('allows cross-phase back at first brand page when previous phase exists', () => {
        const navigation = resolveTasteTestRespondentNavigation(
            { brandIndex: 0 },
            SURVEY_WITH_OVERALL,
            { allowCrossPhaseBack: true },
        );
        expect(navigation.bounds.canGoBack).toBe(true);
        expect(navigation.position.isFirstStep).toBe(true);
    });

    it('resolveTasteTestContinueLabel matches page type', () => {
        const brandPosition = resolveTasteTestNavigationPosition({ brandIndex: 0 }, SURVEY_WITH_OVERALL);
        const overallPosition = resolveTasteTestNavigationPosition({ brandIndex: 2 }, SURVEY_WITH_OVERALL);
        expect(resolveTasteTestContinueLabel(brandPosition, 'en')).toBe('Next Brand');
        expect(resolveTasteTestContinueLabel(overallPosition, 'en')).toBe('Complete Evaluation');
    });

    it('boundary back at first step delegates to cross-phase handler', () => {
        expect(advanceTasteTestNavigation({ brandIndex: 0 }, SURVEY_WITH_OVERALL, 'back')).toEqual({
            type: 'boundary',
        });
    });

    it('filters visible sections for current page', () => {
        const position = resolveTasteTestNavigationPosition({ brandIndex: 0 }, SURVEY_WITH_OVERALL);
        const visible = filterTasteTestVisibleSections(
            SURVEY_WITH_OVERALL.layer2_questions.sections,
            position,
            SURVEY_WITH_OVERALL,
        );
        expect(visible.map((section) => section.title)).toEqual(['BrandA Taste']);
    });
});
