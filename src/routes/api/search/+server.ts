import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchBooks } from '$lib/server/db';

// JSON search API: ?query=… → matching books (≤50, ordered by title).
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json([]);
	const books = await searchBooks(db, url.searchParams.get('query') ?? '');
	return json(books);
};
