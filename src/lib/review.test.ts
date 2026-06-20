import { describe, it, expect } from 'vitest';
import {
	scalarOptions,
	listOptions,
	parseBookForm,
	groupContributorsByRole,
	normalizeBookInput,
} from './review';
import type { Candidate } from './providers';

const CANDS: Candidate[] = [
	{
		source: 'Libris',
		title: 'The Fellowship of the Ring',
		authors: ['J. R. R. Tolkien'],
	},
	{
		source: 'Open Library',
		title: 'Fellowship of the Ring',
		published_by: 'HarperCollins',
		authors: ['J.R.R. Tolkien'],
	},
];

describe('scalarOptions', () => {
	it("offers each source's distinct value", () => {
		expect(scalarOptions(CANDS, 'title')).toEqual([
			{ source: 'Libris', value: 'The Fellowship of the Ring' },
			{ source: 'Open Library', value: 'Fellowship of the Ring' },
		]);
	});
	it('skips missing values', () => {
		expect(scalarOptions(CANDS, 'published_by')).toEqual([
			{ source: 'Open Library', value: 'HarperCollins' },
		]);
	});

	it('de-duplicates identical values across sources', () => {
		const same: Candidate[] = [
			{ source: 'A', title: 'Dune' },
			{ source: 'B', title: 'Dune' },
		];
		expect(scalarOptions(same, 'title')).toEqual([{ source: 'A', value: 'Dune' }]);
	});
});

describe('listOptions', () => {
	it("offers each source's list", () => {
		expect(listOptions(CANDS, 'authors')).toEqual([
			{ source: 'Libris', names: ['J. R. R. Tolkien'] },
			{ source: 'Open Library', names: ['J.R.R. Tolkien'] },
		]);
	});

	it('skips sources with an empty or absent list', () => {
		const cands: Candidate[] = [
			{ source: 'A', authors: [] }, // empty -> skipped
			{ source: 'B' }, // absent -> skipped
			{ source: 'C', authors: ['Ursula K. Le Guin'] },
		];
		expect(listOptions(cands, 'authors')).toEqual([{ source: 'C', names: ['Ursula K. Le Guin'] }]);
	});
});

describe('parseBookForm', () => {
	it('maps scalar fields, contributors by role, and lists', () => {
		const form: Record<string, string> = {
			title: '  The Fellowship of the Ring ',
			published_year: '2004',
			isbn: '978-0-261-10357-3',
			authors: 'J. R. R. Tolkien\n',
			translators: 'Åke Ohlmarks',
			foreword: 'Christopher Tolkien',
			languages: 'eng, swe',
			subjects: 'Fantasy\nMiddle-earth',
		};
		const input = parseBookForm((k) => form[k]);
		expect(input.title).toBe('The Fellowship of the Ring');
		expect(input.published_year).toBe(2004);
		expect(input.isbn).toBe('978-0-261-10357-3');
		expect(input.languages).toEqual(['eng', 'swe']);
		expect(input.subjects).toEqual(['Fantasy', 'Middle-earth']);
		expect(input.contributors).toEqual([
			{ name: 'J. R. R. Tolkien', role: 'author' },
			{ name: 'Åke Ohlmarks', role: 'translator' },
			{ name: 'Christopher Tolkien', role: 'foreword' },
		]);
	});

	it('treats blank fields as null and a non-numeric year as null', () => {
		const input = parseBookForm((k) => ({ published_year: 'n/a' })[k]);
		expect(input.title).toBeNull();
		expect(input.published_year).toBeNull();
		expect(input.contributors).toEqual([]);
		expect(input.languages).toEqual([]); // absent languages -> empty, not [""]
	});

	it('rejects a year with leading non-digits (anchored), yielding null not NaN', () => {
		expect(parseBookForm((k) => ({ published_year: 'x2004' })[k]).published_year).toBeNull();
	});

	it('maps every scalar field and trims list entries', () => {
		const form: Record<string, string> = {
			title: 'T',
			subtitle: 'Sub',
			original_title: 'Orig',
			edition_name: 'Ed',
			description: 'Desc',
			isbn: '9780261103573',
			published_by: 'Pub',
			published_place: 'Place',
			shelf_location: 'Shelf',
			subjects: '  Fantasy  \n Middle-earth ',
		};
		const input = parseBookForm((k) => form[k]);
		expect(input).toMatchObject({
			title: 'T',
			subtitle: 'Sub',
			original_title: 'Orig',
			edition_name: 'Ed',
			description: 'Desc',
			isbn: '9780261103573',
			published_by: 'Pub',
			published_place: 'Place',
			shelf_location: 'Shelf',
			subjects: ['Fantasy', 'Middle-earth'],
		});
	});

	it('accepts a year only if fully numeric, and drops blank language entries', () => {
		expect(parseBookForm((k) => ({ published_year: '2004x' })[k]).published_year).toBeNull();
		expect(parseBookForm((k) => ({ languages: 'eng, , swe,' })[k]).languages).toEqual([
			'eng',
			'swe',
		]);
	});

	it('groups multiple names per role with newlines, including editors', () => {
		const grouped = groupContributorsByRole([
			{ name_as_printed: 'J. R. R. Tolkien', role: 'author' },
			{ name_as_printed: 'Alan Lee', role: 'illustrator' },
			{ name_as_printed: 'Åke Ohlmarks', role: 'translator' },
			{ name_as_printed: 'Douglas A. Anderson', role: 'editor' },
			{ name_as_printed: 'Christopher Tolkien', role: 'editor' },
		]);
		expect(grouped).toEqual({
			authors: 'J. R. R. Tolkien',
			editors: 'Douglas A. Anderson\nChristopher Tolkien',
			illustrators: 'Alan Lee',
			translators: 'Åke Ohlmarks',
			foreword: '',
		});
		// Feeding the grouped fields back through the parser preserves roles, in
		// ROLE_FIELDS order (authors, editors, illustrators, translators, foreword).
		const parsed = parseBookForm((k) => grouped[k]);
		expect(parsed.contributors).toEqual([
			{ name: 'J. R. R. Tolkien', role: 'author' },
			{ name: 'Douglas A. Anderson', role: 'editor' },
			{ name: 'Christopher Tolkien', role: 'editor' },
			{ name: 'Alan Lee', role: 'illustrator' },
			{ name: 'Åke Ohlmarks', role: 'translator' },
		]);
	});
});

describe('normalizeBookInput (editor JSON payload)', () => {
	it('coerces strings, year, arrays, and preserves contributor personId', () => {
		const input = normalizeBookInput({
			title: '  Invisible Cities  ',
			published_year: '1972',
			isbn: '9780156453806',
			languages: ['eng', ''],
			subjects: [' Fiction ', ''],
			contributors: [
				{ name: ' Italo Calvino ', role: 'author', personId: 42 },
				{ name: 'William Weaver', role: 'translator' },
				{ name: '', role: 'author' }, // dropped (blank name)
			],
		});
		expect(input.title).toBe('Invisible Cities');
		expect(input.published_year).toBe(1972);
		expect(input.languages).toEqual(['eng']);
		expect(input.subjects).toEqual(['Fiction']);
		expect(input.contributors).toEqual([
			{ name: 'Italo Calvino', role: 'author', personId: 42 },
			{ name: 'William Weaver', role: 'translator', personId: undefined },
		]);
	});

	it('blank/garbage year and missing fields become null/empty', () => {
		const input = normalizeBookInput({ published_year: 'n/a' });
		expect(input.title).toBeNull();
		expect(input.published_year).toBeNull();
		expect(input.contributors).toEqual([]);
		expect(input.languages).toEqual([]);
	});

	it('maps and trims every scalar field, treating whitespace-only as null', () => {
		expect(
			normalizeBookInput({
				title: ' A ',
				subtitle: ' B ',
				original_title: ' C ',
				edition_name: ' D ',
				description: ' E ',
				isbn: ' 9780261103573 ',
				published_by: ' F ',
				published_place: ' G ',
				shelf_location: '   ', // whitespace-only -> null
			}),
		).toMatchObject({
			title: 'A',
			subtitle: 'B',
			original_title: 'C',
			edition_name: 'D',
			description: 'E',
			isbn: '9780261103573',
			published_by: 'F',
			published_place: 'G',
			shelf_location: null,
		});
	});

	it('coerces the year from each non-numeric form to null', () => {
		expect(normalizeBookInput({ published_year: '' }).published_year).toBeNull();
		expect(normalizeBookInput({ published_year: null }).published_year).toBeNull();
		expect(normalizeBookInput({ published_year: '1850' }).published_year).toBe(1850);
		expect(normalizeBookInput({ published_year: 1850 }).published_year).toBe(1850);
	});

	it('drops contributors with a non-string/blank name or non-string role, and a non-number personId becomes undefined', () => {
		const input = normalizeBookInput({
			contributors: [
				{ name: 123, role: 'author' }, // non-string name -> dropped
				{ name: '   ', role: 'author' }, // blank name -> dropped
				{ name: 'Real', role: 7 }, // non-string role -> dropped
				{ name: 'Kept', role: 'author', personId: 'x' }, // bad personId -> undefined
			],
		});
		expect(input.contributors).toEqual([{ name: 'Kept', role: 'author', personId: undefined }]);
	});
});
