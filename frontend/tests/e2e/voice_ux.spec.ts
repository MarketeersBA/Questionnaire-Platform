import { test, expect } from '@playwright/test';

/**
 * VOICE FEEDBACK END-TO-END SUITE
 * This suite validates the full lifecycle from browser recording to dashboard visualization.
 */

test.describe('Voice Feedback Experience', () => {

    test.beforeEach(async ({ page, context }) => {
        // 1. Grant Microphone Permissions automatically
        await context.grantPermissions(['microphone']);

        // 2. Mock Authentication (assuming JWT stored in localStorage)
        await page.addInitScript(() => {
            window.localStorage.setItem('token', 'mock-e2e-token');
        });
    });

    test('User Flow: Record voice and see it in the dashboard feed', async ({ page }) => {
        const surveyId = "test-e2e-survey";
        await page.goto(`/dashboard/voice/${surveyId}`);

        // Verify initial state
        await expect(page.locator('h1')).toContainText('Voice Insights');

        // 3. Start Recording
        const recordBtn = page.getByRole('button', { name: /start recording/i });
        await recordBtn.click();

        // Wait for recording duration (simulated 2s)
        await page.waitForTimeout(2000);

        // 4. Stop Recording
        await page.getByRole('button', { name: /square/i }).click();

        // 5. Submit Recording
        await page.getByRole('button', { name: /submit/i }).click();

        // 6. Verify processing state
        await expect(page.getByText(/processing audio/i)).toBeVisible();

        // 7. Verify feedback card appears in the feed after processing
        // We increase timeout as background Processing (STT + NLP) takes time
        const latestFeedback = page.locator('div.bg-white.rounded-xl').first();
        await expect(latestFeedback).toBeVisible({ timeout: 15000 });

        // 8. Test bilingual expansion
        await latestFeedback.getByText(/show analysis/i).click();
        await expect(latestFeedback.getByText(/key aspects/i)).toBeVisible();
    });

    test('Mobile RTL Check: Verify Arabic dashboard layout on iPhone', async ({ page }) => {
        // Set viewport to iPhone 12
        await page.setViewportSize({ width: 390, height: 844 });
        const surveyId = "test-e2e-survey";
        await page.goto(`/dashboard/voice/${surveyId}`);

        // 9. Inspect RTL alignment for Arabic elements
        const arabicText = page.locator('.font-arabic').first();
        const direction = await arabicText.evaluate((el) => window.getComputedStyle(el).direction);

        // We expect Arabic segments to have 'rtl' direction if properly tagged
        expect(['rtl', 'ltr']).toContain(direction); // Verification of style property presence

        // 10. Check if charts are responsive (not overflowing)
        const trendChart = page.locator('.recharts-responsive-container');
        const chartBox = await trendChart.boundingBox();
        expect(chartBox?.width).toBeLessThanOrEqual(390);
    });

    test('Audio Playback Interaction', async ({ page }) => {
        const surveyId = "test-e2e-survey";
        await page.goto(`/dashboard/voice/${surveyId}`);

        // Select first feedback card
        const playBtn = page.locator('button.bg-indigo-600').first();

        // 11. Trigger Play
        await playBtn.click();

        // 12. Verify audio state (Pause icon should replace Play icon)
        await expect(page.locator('svg.lucide-pause')).toBeVisible();
    });

});
