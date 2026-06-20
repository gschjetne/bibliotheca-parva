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
		data: { title: TITLE, isbn: null, languages: [], subjects: [], contributors: [] },
	});
	expect(res.ok()).toBeTruthy();
	const { id } = (await res.json()) as { id: number };
	return id;
}

test('edit a book: record shelf location and a contributor, then delete it', async ({
	page,
	request,
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
	// Saving an existing book leaves the form; this page was opened directly, so
	// it falls back to the home page (the "returns to where you came from" path
	// is exercised in its own test below).
	await expect(page).toHaveURL(/\/$/);

	// Re-open the edit page to prove the edits were persisted, not just held.
	await page.goto(`/books/${id}/edit`);
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
	await page.waitForResponse(
		(r) => r.url().includes('/api/search') && r.url().includes(SEARCH_TOKEN),
	);
	await expect(page.getByText(TITLE)).toHaveCount(0);
});

// Acceptance: features/edit_book.feature — "Saving returns the librarian to the
// page they came from". Arriving at the edit page via the search results' edit
// link, saving hands the librarian back to those results, not the form.
test('saving an edited book returns to the page the librarian came from', async ({
	page,
	request,
}) => {
	const id = await createBlankBook(request);

	// Reach the edit page the way a librarian does: from the search results.
	await page.goto('/');
	await page.getByPlaceholder('Search').fill(SEARCH_TOKEN);
	const resultRow = page.getByRole('row', { name: new RegExp(TITLE) });
	await resultRow.getByRole('link', { name: 'edit' }).click();
	await expect(page).toHaveURL(new RegExp(`/books/${id}/edit$`));

	// Make an edit and save it.
	await page.locator('input[name="shelf_location"]').fill('Hallway');
	await page.getByRole('button', { name: 'Save book' }).click();

	// Back on the search page we came from — not stranded on the edit form.
	await expect(page).toHaveURL(/\/$/);
	await expect(page).not.toHaveURL(new RegExp(`/books/${id}/edit$`));

	// A toast confirms the save and offers a link straight back to the record.
	const toast = page.getByRole('status');
	await expect(toast).toContainText('Book saved');
	await expect(toast.getByRole('link', { name: /continue editing/i })).toHaveAttribute(
		'href',
		`/books/${id}/edit`,
	);

	// The edit really was saved.
	await page.goto(`/books/${id}/edit`);
	await expect(page.locator('input[name="shelf_location"]')).toHaveValue('Hallway');

	await request.delete(`/api/books/${id}`);
});

// Acceptance: features/edit_book.feature — "Recording the languages of a book
// from a friendly picker". The librarian picks a human-readable language name;
// the chip shows that name while the value saved is a stable ISO 639-3 code.
test('record a language from the friendly picker, stored as a stable code', async ({
	page,
	request,
}) => {
	const id = await createBlankBook(request);
	await page.goto(`/books/${id}/edit`);

	const langRow = page.getByRole('row', { name: /Languages/ });
	const langInput = langRow.getByPlaceholder('add a language…');
	await langInput.fill('English');
	await langInput.press('Enter');
	// The chip carries the friendly name, not a raw code.
	await expect(langRow.getByText('English')).toBeVisible();

	// What goes over the wire on save is the stable code ("eng"), not "English".
	const [req] = await Promise.all([
		page.waitForRequest((r) => r.url().endsWith(`/api/books/${id}`) && r.method() === 'PUT'),
		page.getByRole('button', { name: 'Save book' }).click(),
	]);
	expect(JSON.parse(req.postData() ?? '{}').languages).toEqual(['eng']);

	// Persisted across a reload (proves it was stored, not just held in the form).
	await expect(page).toHaveURL(new RegExp(`/books/${id}/edit$`));
	await page.reload();
	await expect(page.getByRole('row', { name: /Languages/ }).getByText('English')).toBeVisible();

	page.on('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/$/);
});

// Acceptance: features/edit_book.feature — "Only recognised languages can be
// recorded". An unknown name is never offered and Enter records nothing, so it
// cannot be saved as a language.
test('the language picker refuses an unrecognised language', async ({ page, request }) => {
	const id = await createBlankBook(request);
	await page.goto(`/books/${id}/edit`);

	const langRow = page.getByRole('row', { name: /Languages/ });
	const langInput = langRow.getByPlaceholder('add a language…');
	await langInput.fill('Klingon');

	// No matching suggestion is offered for an unrecognised language.
	await expect(langRow.getByRole('button', { name: /Klingon/ })).toHaveCount(0);

	// Enter records nothing — the text stays loose in the field, no chip is made.
	await langInput.press('Enter');
	await expect(langInput).toHaveValue('Klingon');
	// And because loose text would be dropped on save, saving is blocked.
	await expect(page.getByRole('button', { name: 'Save book' })).toBeDisabled();

	// This test never saves, so remove the scratch book it created.
	await request.delete(`/api/books/${id}`);
});

// The save guard for the chip widgets: free text typed into a chip field but not
// turned into a chip blocks the save (and explains why) until it is committed.
test('save is blocked while a chip field holds unconfirmed free text', async ({
	page,
	request,
}) => {
	const id = await createBlankBook(request);
	await page.goto(`/books/${id}/edit`);

	const saveButton = page.getByRole('button', { name: 'Save book' });
	await expect(saveButton).toBeEnabled();

	const authorsRow = page.getByRole('row', { name: /Authors/ });
	const nameInput = authorsRow.getByPlaceholder('add a name…');
	await nameInput.fill('Unconfirmed Person');

	// Loose text -> save disabled, with an explanation of how to resolve it.
	// (String matcher, not regex: it normalizes whitespace so the assertion
	// survives the message wrapping across lines.)
	await expect(saveButton).toBeDisabled();
	await expect(page.getByText('Press Enter to turn it into a chip')).toBeVisible();

	// Committing the chip clears the loose text and re-enables save.
	await nameInput.press('Enter');
	await expect(authorsRow.getByText('Unconfirmed Person')).toBeVisible();
	await expect(saveButton).toBeEnabled();

	// This test never saves, so remove the scratch book it created.
	await request.delete(`/api/books/${id}`);
});
