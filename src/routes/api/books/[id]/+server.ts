import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateBook, deleteBook } from '$lib/server/mutate';
import { normalizeBookInput } from '$lib/review';

export const PUT: RequestHandler = async ({ params, request, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json({ error: 'no database' }, { status: 500 });
	const id = Number(params.id);
	await updateBook(db, id, normalizeBookInput(await request.json()));
	return json({ id });
};

export const DELETE: RequestHandler = async ({ params, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json({ error: 'no database' }, { status: 500 });
	await deleteBook(db, Number(params.id));
	return json({ ok: true });
};
