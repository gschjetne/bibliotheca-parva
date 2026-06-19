import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { suggestText } from '$lib/server/db';

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json([]);
	return json(await suggestText(db, 'published_place', url.searchParams.get('q') ?? ''));
};
