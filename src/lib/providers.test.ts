import { describe, it, expect } from 'vitest';
import {
	reorderName,
	parseRefworks,
	openLibrary,
	bibbi,
	gatherCandidates,
	type Provider,
} from './providers';

const ISBN = '9780261103573';

/** A mock fetch routing by URL substring to canned Responses. */
function mockFetch(routes: Record<string, { status?: number; body: string }>) {
	return (async (url: string | URL | Request) => {
		const u = String(url);
		for (const [needle, r] of Object.entries(routes)) {
			if (u.includes(needle)) {
				return new Response(r.body, { status: r.status ?? 200 });
			}
		}
		return new Response('', { status: 404 });
	}) as typeof fetch;
}

describe('reorderName', () => {
	it("flips 'Last, First' to 'First Last'", () => {
		expect(reorderName('Tolkien, J. R. R.')).toBe('J. R. R. Tolkien');
		expect(reorderName('Murakami')).toBe('Murakami');
	});
	it('trims the dangling space from a trailing comma', () => {
		expect(reorderName('Tolkien, ')).toBe('Tolkien');
	});
});

describe('Open Library provider', () => {
	it('parses a record and resolves author names via sub-fetch', async () => {
		const f = mockFetch({
			[`/isbn/${ISBN}.json`]: {
				body: JSON.stringify({
					title: 'The Fellowship of the Ring',
					publishers: ['Allen & Unwin'],
					publish_date: '1 August 2004',
					authors: [{ key: '/authors/OL26320A' }],
					description: { value: 'Volume one.' },
				}),
			},
			'/authors/OL26320A.json': {
				body: JSON.stringify({ name: 'J. R. R. Tolkien' }),
			},
		});
		const c = await openLibrary.fetch(ISBN, f);
		expect(c).toMatchObject({
			source: 'Open Library',
			title: 'The Fellowship of the Ring',
			published_by: 'Allen & Unwin',
			published_year: 2004,
			authors: ['J. R. R. Tolkien'],
			description: 'Volume one.',
		});
	});

	it('returns null when the ISBN is unknown (404)', async () => {
		expect(await openLibrary.fetch(ISBN, mockFetch({}))).toBeNull();
	});

	it("parses every field, joining multi-valued ones with ', '", async () => {
		const f = mockFetch({
			[`/isbn/${ISBN}.json`]: {
				body: JSON.stringify({
					title: 'The Lord of the Rings',
					subtitle: 'being three volumes',
					edition_name: '50th Anniversary',
					publishers: ['Allen & Unwin', 'HarperCollins'],
					publish_places: ['London', 'Boston'],
					publish_date: '2004',
					description: 'An epic.', // plain-string description branch
					authors: [{ key: '/authors/OL1A' }, { key: '/authors/OL2A' }],
				}),
			},
			'/authors/OL1A.json': { body: JSON.stringify({ name: 'J. R. R. Tolkien' }) },
			'/authors/OL2A.json': { body: JSON.stringify({ name: 'Christopher Tolkien' }) },
		});
		// toEqual (not toMatchObject) so a stray/renamed field fails the test.
		expect(await openLibrary.fetch(ISBN, f)).toEqual({
			source: 'Open Library',
			title: 'The Lord of the Rings',
			subtitle: 'being three volumes',
			edition_name: '50th Anniversary',
			published_by: 'Allen & Unwin, HarperCollins',
			published_place: 'London, Boston',
			published_year: 2004,
			description: 'An epic.',
			authors: ['J. R. R. Tolkien', 'Christopher Tolkien'],
		});
	});

	it('skips author entries that are null, keyless, or whose sub-fetch fails', async () => {
		const f = mockFetch({
			[`/isbn/${ISBN}.json`]: {
				body: JSON.stringify({
					title: 'Anon',
					authors: [null, { name: 'no key here' }, { key: '/authors/OLX' }],
				}),
			},
			// /authors/OLX returns 404 (default) -> name not collected
		});
		const c = await openLibrary.fetch(ISBN, f);
		expect(c).toEqual({ source: 'Open Library', title: 'Anon' });
	});
});

describe('Bibbi provider', () => {
	it('parses creators, publication subjects and year', async () => {
		const f = mockFetch({
			'bibliografisk.bs.no': {
				body: JSON.stringify({
					total: 1,
					works: [
						{
							name: 'Norwegian Wood',
							creator: [{ name: 'Murakami, Haruki' }],
							publications: [
								{
									isbn: ISBN,
									description: 'A novel.',
									about: [{ name: { nob: 'Kjærlighet' } }],
									genre: [{ name: { nob: 'Roman' } }],
									datePublished: '1987',
								},
							],
						},
					],
				}),
			},
		});
		const c = await bibbi.fetch(ISBN, f);
		expect(c).toMatchObject({
			source: 'Bibbi',
			title: 'Norwegian Wood',
			authors: ['Haruki Murakami'],
			description: 'A novel.',
			subjects: ['Kjærlighet', 'Roman'],
			published_year: 1987,
		});
	});

	it('returns null unless exactly one work matches', async () => {
		const f = mockFetch({
			'bibliografisk.bs.no': { body: JSON.stringify({ total: 0, works: [] }) },
		});
		expect(await bibbi.fetch(ISBN, f)).toBeNull();
	});

	it("prefers the matching publication's title and skips subjects lacking a Bokmål name", async () => {
		const f = mockFetch({
			'bibliografisk.bs.no': {
				body: JSON.stringify({
					total: 1,
					works: [
						{
							name: 'Work-level title',
							creator: [{ name: 'Murakami, Haruki' }, { name: '' }], // blank dropped
							publications: [
								{ isbn: '0000000000000', name: 'Wrong edition' }, // not the queried isbn
								{
									isbn: ISBN,
									name: 'Edition title', // overrides the work-level name
									about: [null, { name: { nob: 'Kjærlighet' } }, { name: { eng: 'Love' } }],
									genre: [{ name: {} }, null, { name: { nob: 'Roman' } }],
								},
							],
						},
					],
				}),
			},
		});
		// Only the nob-named subjects survive; title comes from the matching pub.
		expect(await bibbi.fetch(ISBN, f)).toEqual({
			source: 'Bibbi',
			title: 'Edition title',
			authors: ['Haruki Murakami'],
			subjects: ['Kjærlighet', 'Roman'],
		});
	});

	it('keeps the work title when no publication matches the ISBN', async () => {
		const f = mockFetch({
			'bibliografisk.bs.no': {
				body: JSON.stringify({
					total: 1,
					works: [{ name: 'Only the work', publications: [{ isbn: '9999999999999' }] }],
				}),
			},
		});
		expect(await bibbi.fetch(ISBN, f)).toEqual({ source: 'Bibbi', title: 'Only the work' });
	});
});

describe('Libris refworks parser', () => {
	it('parses fields and reorders contributor names when the ISBN matches', () => {
		const block = [
			'T1 The Fellowship of the Ring',
			'T2 being the first part',
			'A1 Tolkien, J. R. R.',
			'A2 Anderson, Douglas A.',
			'PB Allen & Unwin',
			'PP London',
			'YR 1954',
			'K1 Fantasy',
			`SN ${ISBN}`,
		].join('\r\n');
		const c = parseRefworks(block, ISBN);
		expect(c).toMatchObject({
			source: 'Libris',
			title: 'The Fellowship of the Ring',
			subtitle: 'being the first part',
			authors: ['J. R. R. Tolkien'],
			editors: ['Douglas A. Anderson'],
			published_by: 'Allen & Unwin',
			published_place: 'London',
			published_year: 1954,
			subjects: ['Fantasy'],
		});
	});

	it('returns null when no SN line matches the ISBN', () => {
		const block = ['T1 Some Other Book', 'SN 9999999999999'].join('\r\n');
		expect(parseRefworks(block, ISBN)).toBeNull();
	});

	it('maps every field type, joins multi-valued publisher/place, and matches a dashed SN', () => {
		const block = [
			'T1 The Lord of the Rings',
			'T2 the subtitle',
			'ED Second edition', // default-branch field (edition_name)
			'AB A description.', // default-branch field (description)
			'A1 Tolkien, J. R. R.',
			'A1 Tolkien, Christopher',
			'A2 Anderson, Douglas A.',
			'K1 Fantasy',
			'K1 Middle-earth',
			'PB Allen & Unwin',
			'PB HarperCollins',
			'PP London',
			'PP Boston',
			'YR 1954',
			'ZZ ignored unknown key',
			'x', // shorter than 4 chars -> skipped
			'SN 978-0-261-10357-3', // dashed form still matches the queried ISBN
		].join('\r\n');
		expect(parseRefworks(block, ISBN)).toEqual({
			source: 'Libris',
			title: 'The Lord of the Rings',
			subtitle: 'the subtitle',
			edition_name: 'Second edition',
			description: 'A description.',
			authors: ['J. R. R. Tolkien', 'Christopher Tolkien'],
			editors: ['Douglas A. Anderson'],
			subjects: ['Fantasy', 'Middle-earth'],
			published_by: 'Allen & Unwin, HarperCollins',
			published_place: 'London, Boston',
			published_year: 1954,
		});
	});

	it('returns null when the only matching line is the SN (no other data)', () => {
		expect(parseRefworks(`SN ${ISBN}`, ISBN)).toBeNull();
	});

	it('processes a field line of exactly the minimum length (4 chars)', () => {
		const block = ['T1 X', `SN ${ISBN}`].join('\r\n'); // "T1 X" is 4 chars
		expect(parseRefworks(block, ISBN)).toEqual({ source: 'Libris', title: 'X' });
	});
});

describe('gatherCandidates fan-out', () => {
	const ok = (name: string): Provider => ({
		name,
		fetch: async () => ({ source: name, title: `${name} title` }),
	});
	const down = (name: string): Provider => ({
		name,
		fetch: async () => {
			throw new Error('unavailable');
		},
	});
	const empty = (name: string): Provider => ({ name, fetch: async () => null });

	it('collects results from healthy providers, preserving order', async () => {
		const got = await gatherCandidates(ISBN, mockFetch({}), [
			ok('Libris'),
			ok('Open Library'),
			ok('Bibbi'),
		]);
		expect(got.map((c) => c.source)).toEqual(['Libris', 'Open Library', 'Bibbi']);
	});

	it('a provider being unavailable does not block the others', async () => {
		const got = await gatherCandidates(ISBN, mockFetch({}), [
			down('Libris'),
			ok('Open Library'),
			empty('Bibbi'),
		]);
		expect(got.map((c) => c.source)).toEqual(['Open Library']);
	});
});
