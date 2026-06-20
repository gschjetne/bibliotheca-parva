import { test, expect } from '@playwright/test';

// Acceptance: features/add_book_by_isbn.feature — "The lookup is triggered from
// the home-page ISBN field" (by Return or the Add button), plus the inline
// rejection of an invalid ISBN before any lookup.

const ISBN = '9780261103573';

test.describe('home-page add-by-ISBN', () => {
	// A valid lookup reaches the live sources; mock them for determinism.
	test.beforeEach(async ({ page }) => {
		await page.route('**/openlibrary.org/**', (r) => r.fulfill({ status: 404, body: '' }));
		await page.route('**/libris.kb.se/**', (r) =>
			r.fulfill({
				contentType: 'text/plain',
				body: ['T1 The Fellowship of the Ring', `SN ${ISBN}`].join('\r\n')
			})
		);
		await page.route('**/bibliografisk.bs.no/**', (r) => r.fulfill({ status: 404, body: '' }));
	});

	test('pressing Return in the home ISBN field runs the lookup', async ({ page }) => {
		await page.goto('/');
		await page.getByPlaceholder('ISBN').fill(ISBN);
		await page.getByPlaceholder('ISBN').press('Enter');

		await expect(page).toHaveURL(new RegExp(`/add\\?isbn=${ISBN}$`));
		// The review screen appears with the looked-up candidate.
		await expect(page.getByRole('columnheader', { name: 'Your record' })).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'The Fellowship of the Ring' }).first()
		).toBeVisible();
	});

	test('clicking Add runs the lookup too', async ({ page }) => {
		await page.goto('/');
		await page.getByPlaceholder('ISBN').fill(ISBN);
		await page.getByRole('button', { name: 'Add' }).click();

		await expect(page).toHaveURL(new RegExp(`/add\\?isbn=${ISBN}$`));
		await expect(page.getByRole('columnheader', { name: 'Your record' })).toBeVisible();
	});

	test('an invalid ISBN is rejected inline without leaving the home page', async ({ page }) => {
		await page.goto('/');
		await page.getByPlaceholder('ISBN').fill('1234567890');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect(page.getByText('"1234567890" is not a valid ISBN.')).toBeVisible();
		await expect(page).toHaveURL(/\/$/);
	});

	test('an empty ISBN field opens a full blank book form to add by hand', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect(page).toHaveURL(/\/add$/);
		// Not just an ISBN field: the full editor table is shown, ready to fill in
		// a book that has no ISBN at all.
		await expect(page.getByRole('columnheader', { name: 'Your record' })).toBeVisible();
		await expect(page.locator('input[name="title"]')).toBeVisible();
	});
});
