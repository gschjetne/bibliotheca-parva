import { test, expect, type APIRequestContext } from '@playwright/test';

// Acceptance: features/edit_book.feature — record a shelf location and a
// contributor, confirm both persist, then delete the book and confirm it leaves
// the catalogue. Runs against the built Worker + seeded local D1.

// A rare title token so search assertions don't collide with the ~1700 seeded
// books, and a contributor name that matches no existing person (so the chip
// picker records a brand-new person rather than linking a suggestion).
const TITLE = 'Zzqxtest Acceptance Volume';
const SEARCH_TOKEN = 'Zzqxtest';
const AUTHOR = 'Qphwx Authorson';
const SUBJECT = 'Zzqxsubject Topic';

async function createBlankBook(request: APIRequestContext): Promise<number> {
	const res = await request.post('/api/books', {
		data: { title: TITLE, isbn: null, languages: [], subjects: [], contributors: [] }
	});
	expect(res.ok()).toBeTruthy();
	const { id } = (await res.json()) as { id: number };
	return id;
}

test('edit a book: record shelf location and a contributor, then delete it', async ({
	page,
	request
}) => {
	const id = await createBlankBook(request);

	await page.goto(`/books/${id}/edit`);
	await expect(page.locator('input[name="title"]')).toHaveValue(TITLE);

	// Record where the book is shelved.
	await page.locator('input[name="shelf_location"]').fill('Living room, top shelf');

	// Add an author through the contributor chip picker. The name matches no
	// existing person, so Enter records it as a new contributor.
	const authorsRow = page.getByRole('row', { name: /Authors/ });
	const nameInput = authorsRow.getByPlaceholder('add a name…');
	await nameInput.fill(AUTHOR);
	await nameInput.press('Enter');
	await expect(authorsRow.getByText(AUTHOR)).toBeVisible();

	// Add a subject through its chip picker (unique, so it's recorded as typed).
	const subjectsRow = page.getByRole('row', { name: /Subjects/ });
	const subjectInput = subjectsRow.getByPlaceholder('add a subject…');
	await subjectInput.fill(SUBJECT);
	await subjectInput.press('Enter');
	await expect(subjectsRow.getByText(SUBJECT)).toBeVisible();

	await page.getByRole('button', { name: 'Save book' }).click();
	await expect(page).toHaveURL(new RegExp(`/books/${id}/edit$`));

	// Reload to prove the edits were persisted, not just held in the form.
	await page.reload();
	await expect(page.locator('input[name="shelf_location"]')).toHaveValue('Living room, top shelf');
	await expect(page.getByText(AUTHOR)).toBeVisible();
	await expect(page.getByText(SUBJECT)).toBeVisible();

	// The book is findable in the catalogue...
	await page.goto('/');
	await page.getByPlaceholder('Search').fill(SEARCH_TOKEN);
	await expect(page.getByText(TITLE)).toBeVisible();

	// ...and deleting it removes it from search results.
	await page.goto(`/books/${id}/edit`);
	page.on('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/$/);

	await page.getByPlaceholder('Search').fill(SEARCH_TOKEN);
	await page.waitForResponse((r) => r.url().includes('/api/search') && r.url().includes(SEARCH_TOKEN));
	await expect(page.getByText(TITLE)).toHaveCount(0);
});
