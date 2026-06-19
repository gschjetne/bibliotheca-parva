import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createBook } from '$lib/server/mutate';
import { normalizeBookInput } from '$lib/review';

// Create a book from the editor's JSON payload. Returns the new id.
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json({ error: 'no database' }, { status: 500 });
	const id = await createBook(db, normalizeBookInput(await request.json()));
	return json({ id });
};
