import { expect, test } from '@playwright/test';

const TOKEN = 'test-scale-token';
const SESSION_KEY = `survey_session_v4_${TOKEN}`;

const mockSurveyResponse = {
    language: 'en',
    company_name: 'Test Labs',
    template_name: 'Scale Drag E2E',
    voice_capture: null,
    ai_followup: null,
    layer2_questions: {
        sections: [
            {
                title: 'Overall',
                questions: [
                    {
                        id: 'q_scale',
                        text: 'How much do you like it?',
                        type: 'scale',
                        required: true,
                        questionMeta: {
                            nature: 'fixed',
                            inputType: 'scale',
                            scaleMax: 5,
                            minLabel: 'Not at all',
                            maxLabel: 'Extremely',
                        },
                    },
                ],
            },
        ],
    },
    taste_test_config: {
        own_brand: 'BrandA',
        internal_brands_data: [{ name: 'BrandA' }],
        competitor_brands_data: [],
    },
};

test.describe('Respondent scale drag mobile flow', () => {
    test('drag and tap scale, then persist in local storage', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });

        await page.addInitScript(([key]) => {
            window.localStorage.setItem(
                key,
                JSON.stringify({
                    step: 'layer2',
                    currentBrandIndex: 0,
                    l2Answers: {},
                    answers: {},
                    moduleAnswers: {},
                    moduleStepIndexes: {},
                    completedModules: [],
                    phone: '',
                    countryCode: '+20',
                    customBrands: [],
                    aiInsights: {},
                    productTestAnswers: {},
                    productTestPhaseIndex: 0,
                    productTestSectionIndex: 0,
                    productTestWizardMode: 'intro',
                    startTime: Date.now(),
                    updatedAt: Date.now(),
                }),
            );
        }, [SESSION_KEY]);

        await page.route(`**/s/${TOKEN}`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockSurveyResponse),
            });
        });

        await page.goto(`/s/${TOKEN}`);

        const sliders = page.getByRole('slider');
        const thumb = sliders.nth(0);
        const range = page.locator('input[type="range"]').first();

        await expect(thumb).toBeVisible();

        const sliderBox = await range.boundingBox();
        if (!sliderBox) throw new Error('Range slider not rendered');

        // Drag right: should push value to upper range.
        await page.mouse.move(sliderBox.x + 20, sliderBox.y + sliderBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(sliderBox.x + sliderBox.width - 20, sliderBox.y + sliderBox.height / 2);
        await page.mouse.up();

        const afterDragValue = await thumb.getAttribute('aria-valuenow');
        expect(Number(afterDragValue || '1')).toBeGreaterThanOrEqual(4);

        // Tap center: should jump around midpoint.
        await page.mouse.click(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);
        const afterCenterTap = await thumb.getAttribute('aria-valuenow');
        expect(Number(afterCenterTap || '1')).toBe(3);

        // Verify persisted answer in localStorage session payload.
        const persisted = await page.evaluate(([key]) => {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, [SESSION_KEY]);

        expect(persisted?.l2Answers?.BrandA_q_scale).toBe(3);
    });
});
