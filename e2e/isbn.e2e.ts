import { test, expect } from '@playwright/test';

// Acceptance: features/isbn_handling.feature and the ISBN-validation scenarios
// in features/add_book_by_isbn.feature. Validation is purely client-side, so we
// stub every outbound source to keep a *valid* lookup off the network.
test.beforeEach(async ({ page }) => {
	await page.route('**/openlibrary.org/**', (r) => r.fulfill({ status: 404, body: '' }));
	await page.route('**/libris.kb.se/**', (r) => r.fulfill({ status: 404, body: '' }));
	await page.route('**/bibliografisk.bs.no/**', (r) => r.fulfill({ status: 404, body: '' }));
});

const reviewTable = (page: import('@playwright/test').Page) =>
	page.getByRole('columnheader', { name: 'Your record' });

// add_book_by_isbn.feature: "Rejecting an invalid ISBN before any lookup".
test('a malformed ISBN is rejected before any lookup runs', async ({ page }) => {
	await page.goto('/add');
	await page.getByPlaceholder('ISBN').fill('1234567890');
	await page.getByRole('button', { name: 'Look up' }).click();

	await expect(page.getByText('Not a valid ISBN.')).toBeVisible();
	// No review screen — the lookup never happened.
	await expect(reviewTable(page)).toHaveCount(0);
});

// isbn_handling.feature: a wrong check digit is not a valid ISBN.
test('an ISBN with a bad check digit is rejected', async ({ page }) => {
	await page.goto('/add');
	await page.getByPlaceholder('ISBN').fill('9780261103579');
	await page.getByRole('button', { name: 'Look up' }).click();

	await expect(page.getByText('Not a valid ISBN.')).toBeVisible();
	await expect(reviewTable(page)).toHaveCount(0);
});

// isbn_handling.feature: "A book can be looked up by any form of its ISBN" —
// the 10-digit, dashed form is accepted and the lookup proceeds.
test('a valid ISBN in dashed 10-digit form is accepted and the lookup proceeds', async ({
	page
}) => {
	await page.goto('/add');
	await page.getByPlaceholder('ISBN').fill('0-261-10357-1');
	await page.getByRole('button', { name: 'Look up' }).click();

	// The review screen appears (lookup ran) and there is no validation error.
	await expect(reviewTable(page)).toBeVisible();
	await expect(page.getByText('Not a valid ISBN.')).toHaveCount(0);
});
