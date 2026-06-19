import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { suggestContributors } from '$lib/server/db';

// Autocomplete for the contributor field: existing people matching ?q=…
// Picking one links the book to that identity (see mutate.insertContributors).
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json([]);
	return json(await suggestContributors(db, url.searchParams.get('q') ?? ''));
};
