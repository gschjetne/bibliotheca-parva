// ISBN validation, canonicalisation, and 10<->13 conversion.
// Pure functions, no dependencies. Behaviour is pinned by test/isbn.test.ts and
// features/isbn_handling.feature.

const clean = (s: string): string => s.replace(/[\s-]/g, '').toUpperCase();

function isValidIsbn10(raw: string): boolean {
	const s = clean(raw);
	if (!/^\d{9}[\dX]$/.test(s)) return false;
	let sum = 0;
	for (let i = 0; i < 10; i++) {
		const v = s[i] === 'X' ? 10 : Number(s[i]);
		sum += v * (10 - i);
	}
	return sum % 11 === 0;
}

function isValidIsbn13(raw: string): boolean {
	const s = clean(raw);
	if (!/^\d{13}$/.test(s)) return false;
	let sum = 0;
	for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
	return sum % 10 === 0;
}

export function isValidIsbn(raw: string): boolean {
	return isValidIsbn10(raw) || isValidIsbn13(raw);
}

function isbn10CheckDigit(first9: string): string {
	let sum = 0;
	for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
	const r = (11 - (sum % 11)) % 11;
	return r === 10 ? 'X' : String(r);
}

function isbn13CheckDigit(first12: string): string {
	let sum = 0;
	for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
	return String((10 - (sum % 10)) % 10);
}

/** Canonical 13-digit form (no dashes), or null if the input is not a valid ISBN. */
export function toIsbn13(raw: string): string | null {
	const s = clean(raw);
	if (isValidIsbn13(s)) return s;
	if (isValidIsbn10(s)) {
		const core = '978' + s.slice(0, 9);
		return core + isbn13CheckDigit(core);
	}
	return null;
}

/** Canonical 10-digit form, or null if invalid or a 979-prefixed ISBN-13 (no ISBN-10 exists). */
export function toIsbn10(raw: string): string | null {
	const s = clean(raw);
	if (isValidIsbn10(s)) return s;
	if (isValidIsbn13(s)) {
		if (!s.startsWith('978')) return null;
		const core = s.slice(3, 12);
		return core + isbn10CheckDigit(core);
	}
	return null;
}
