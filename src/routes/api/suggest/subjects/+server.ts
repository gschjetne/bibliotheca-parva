import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { suggestSubjects } from '$lib/server/db';

// Autocomplete for the subjects field: existing subject names matching ?q=…
// Subjects are deduped by name on save (see mutate.linkSubjects), so this just
// helps reuse the spelling already in the catalogue.
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json([]);
	return json(await suggestSubjects(db, url.searchParams.get('q') ?? ''));
};
