import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBookForEdit } from '$lib/server/mutate';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env.DB;
	if (!db) throw error(500, 'no database');
	const book = await getBookForEdit(db, Number(params.id));
	if (!book) throw error(404, 'Book not found');
	return { book };
};
