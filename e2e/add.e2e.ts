import { test, expect } from '@playwright/test';

const ISBN = '9780261103573';

// Mock the three bibliographic sources (the browser fetches them directly), so
// the editor's source columns are deterministic.
test.beforeEach(async ({ page }) => {
	await page.route('**/openlibrary.org/isbn/**', (r) =>
		r.fulfill({ json: { title: 'Fellowship of the Ring', authors: [{ key: '/authors/OL1A' }] } })
	);
	await page.route('**/openlibrary.org/authors/**', (r) =>
		r.fulfill({ json: { name: 'J. R. R. Tolkien' } })
	);
	await page.route('**/libris.kb.se/**', (r) =>
		r.fulfill({
			contentType: 'text/plain',
			body: ['T1 The Fellowship of the Ring', 'PB Allen & Unwin', `SN ${ISBN}`].join('\r\n')
		})
	);
	await page.route('**/bibliografisk.bs.no/**', (r) => r.fulfill({ status: 404, body: '' }));
});

test('look up an ISBN, copy a source value into the record, save and delete', async ({ page }) => {
	await page.goto('/add');
	await page.getByPlaceholder('ISBN').fill(ISBN);
	await page.getByRole('button', { name: 'Look up' }).click();

	// The Libris column shows its title; clicking copies it into the record.
	const sourceTitle = page.getByRole('button', { name: 'The Fellowship of the Ring' }).first();
	await expect(sourceTitle).toBeVisible();
	await sourceTitle.click();
	await expect(page.locator('input[name="title"]')).toHaveValue('The Fellowship of the Ring');

	// Copy the publisher Libris offered.
	await page.getByRole('button', { name: 'Allen & Unwin' }).click();

	// Save -> land on the new book's edit page.
	await page.getByRole('button', { name: 'Save book' }).click();
	await expect(page).toHaveURL(/\/books\/\d+\/edit$/);
	await expect(page.locator('input[name="title"]')).toHaveValue('The Fellowship of the Ring');

	// Clean up so the catalogue isn't left with a test book.
	page.on('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/$/);
});

// Acceptance: features/add_book_manually.feature — a book too old to have an
// ISBN is hand-entered on a full blank form, with no source ever queried.
test('add a book with no ISBN entirely by hand, save and delete', async ({ page }) => {
	await page.goto('/add');

	// The full editor is shown immediately — not just an ISBN field — and no
	// lookup has run, so no source title appears.
	await expect(page.getByRole('columnheader', { name: 'Your record' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'The Fellowship of the Ring' })).toHaveCount(0);

	await page.locator('input[name="title"]').fill('Hand-bound Antiquarian Volume');

	// Save -> land on the new book's edit page with the hand-entered title kept.
	await page.getByRole('button', { name: 'Save book' }).click();
	await expect(page).toHaveURL(/\/books\/\d+\/edit$/);
	await expect(page.locator('input[name="title"]')).toHaveValue('Hand-bound Antiquarian Volume');

	// Clean up so the catalogue isn't left with a test book.
	page.on('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/$/);
});
