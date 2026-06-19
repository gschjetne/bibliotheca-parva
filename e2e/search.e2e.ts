import { test, expect } from '@playwright/test';

// Runs against the built Worker + seeded local D1 (see playwright.config.ts).

test('live search finds a book by a contributor name', async ({ page }) => {
	await page.goto('/');
	await page.getByPlaceholder('Search').fill('murakami');
	await expect(page.getByText('Norwegian wood')).toBeVisible();
});

test('search is case-insensitive', async ({ page }) => {
	await page.goto('/');
	await page.getByPlaceholder('Search').fill('MURAKAMI');
	await expect(page.getByText('Norwegian wood')).toBeVisible();
});

test('an empty search box shows no results', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('tbody tr')).toHaveCount(0);
});
