// Pure helpers for the add/review screen: turning provider Candidates into
// per-field options, and parsing the submitted form into a BookInput. No I/O —
// see test/review.test.ts. DB writes live in mutate.ts.
import type { Candidate } from './providers';

// `personId` set => link to that existing identity; absent => create a new person.
export type ContributorInput = { name: string; role: string; personId?: number };

export type BookInput = {
	title: string | null;
	subtitle: string | null;
	original_title: string | null;
	edition_name: string | null;
	description: string | null;
	isbn: string | null;
	published_by: string | null;
	published_place: string | null;
	published_year: number | null;
	languages: string[];
	shelf_location: string | null;
	contributors: ContributorInput[];
	subjects: string[];
};

/** Coerce an untrusted JSON body (from the SvelteKit editor) into a BookInput. */
export function normalizeBookInput(raw: unknown): BookInput {
	const o = (raw ?? {}) as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
	const list = (v: unknown) => (Array.isArray(v) ? v : []);
	const y = o.published_year;
	return {
		title: str(o.title),
		subtitle: str(o.subtitle),
		original_title: str(o.original_title),
		edition_name: str(o.edition_name),
		description: str(o.description),
		isbn: str(o.isbn),
		published_by: str(o.published_by),
		published_place: str(o.published_place),
		published_year: y === '' || y == null || !Number.isFinite(Number(y)) ? null : Number(y),
		languages: list(o.languages).map(String).filter(Boolean),
		shelf_location: str(o.shelf_location),
		subjects: list(o.subjects)
			.map(String)
			.map((s) => s.trim())
			.filter(Boolean),
		contributors: list(o.contributors)
			.map((c) => c as Record<string, unknown>)
			.filter((c) => typeof c.name === 'string' && c.name.trim() && typeof c.role === 'string')
			.map((c) => ({
				name: (c.name as string).trim(),
				role: c.role as string,
				personId: typeof c.personId === 'number' ? c.personId : undefined,
			})),
	};
}

// Textarea field name -> contribution role.
const ROLE_FIELDS: [string, string][] = [
	['authors', 'author'],
	['editors', 'editor'],
	['illustrators', 'illustrator'],
	['translators', 'translator'],
	['foreword', 'foreword'],
];

/** Distinct values offered for a scalar field, one entry per contributing source. */
export function scalarOptions(
	cands: Candidate[],
	key: string,
): { source: string; value: string }[] {
	const out: { source: string; value: string }[] = [];
	const seen = new Set<string>();
	for (const c of cands) {
		const v = c[key as keyof Candidate];
		if (v == null || Array.isArray(v)) continue;
		const value = String(v);
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push({ source: c.source, value });
	}
	return out;
}

/** Each source's list for a list-valued field (authors, subjects, ...). */
export function listOptions(
	cands: Candidate[],
	key: string,
): { source: string; names: string[] }[] {
	const out: { source: string; names: string[] }[] = [];
	for (const c of cands) {
		const v = c[key as keyof Candidate];
		if (Array.isArray(v) && v.length) out.push({ source: c.source, names: v as string[] });
	}
	return out;
}

/** Group a book's contributions into newline-joined names per role field. */
export function groupContributorsByRole(
	rows: { name_as_printed: string; role: string }[],
): Record<string, string> {
	const lists: Record<string, string[]> = {};
	for (const r of rows) (lists[r.role] ??= []).push(r.name_as_printed);
	const out: Record<string, string> = {};
	for (const [field, role] of ROLE_FIELDS) out[field] = (lists[role] ?? []).join('\n');
	return out;
}

type Getter = (key: string) => string | undefined | null;

/** Parse a submitted book form into a BookInput. */
export function parseBookForm(get: Getter): BookInput {
	const str = (k: string) => {
		const v = (get(k) ?? '').toString().trim();
		return v || null;
	};
	const lines = (k: string) =>
		(get(k) ?? '')
			.toString()
			.split('\n')
			.map((x) => x.trim())
			.filter(Boolean);

	const contributors: ContributorInput[] = [];
	for (const [field, role] of ROLE_FIELDS)
		for (const name of lines(field)) contributors.push({ name, role });

	const yearStr = str('published_year');
	const year = yearStr && /^\d+$/.test(yearStr) ? Number(yearStr) : null;

	return {
		title: str('title'),
		subtitle: str('subtitle'),
		original_title: str('original_title'),
		edition_name: str('edition_name'),
		description: str('description'),
		isbn: str('isbn'),
		published_by: str('published_by'),
		published_place: str('published_place'),
		published_year: year,
		languages: (get('languages') ?? '')
			.toString()
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean),
		shelf_location: str('shelf_location'),
		contributors,
		subjects: lines('subjects'),
	};
}
