// Language helpers for display and the picker. Codes are ISO 639-3 (matching the
// stored data); names come from the runtime's Intl.DisplayNames (no dataset to
// bundle). The picker offers a CURATED set of common natural languages — so it
// won't offer e.g. Klingon — but display works for ANY stored code.

const display = new Intl.DisplayNames(['en'], { type: 'language' });

/** Human name for a language code, or the code itself if unrecognised. */
export function languageName(code: string): string {
	const name = display.of(code);
	return name && name.toLowerCase() !== code.toLowerCase() ? name : code;
}

/** Whether the runtime recognises a code as a real language (rejects garbage). */
export function isRecognised(code: string): boolean {
	const name = display.of(code);
	return !!name && name.toLowerCase() !== code.toLowerCase();
}

// Curated common languages (ISO 639-3). Broad enough for any household book;
// excludes constructed/obscure codes so the picker stays friendly.
const CURATED = [
	'eng', 'fra', 'deu', 'spa', 'ita', 'por', 'nld', 'swe', 'nob', 'nno', 'dan',
	'isl', 'fin', 'nor', 'pol', 'ces', 'slk', 'hun', 'ron', 'ell', 'bul', 'hrv',
	'srp', 'slv', 'ukr', 'rus', 'bel', 'lit', 'lav', 'est', 'gle', 'cym', 'gla',
	'cat', 'eus', 'glg', 'sqi', 'mkd', 'lat', 'grc', 'ang', 'ara', 'heb', 'fas',
	'tur', 'hin', 'ben', 'urd', 'pan', 'tam', 'tel', 'mar', 'guj', 'zho', 'yue',
	'jpn', 'kor', 'vie', 'tha', 'ind', 'msa', 'swa', 'afr', 'amh', 'tgl'
];

export type LanguageOption = { code: string; name: string };

/** The curated languages as {code, name}, recognised names only, sorted by name. */
export const LANGUAGE_OPTIONS: LanguageOption[] = CURATED.map((code) => ({
	code,
	name: languageName(code)
}))
	.filter((o) => o.name !== o.code)
	.sort((a, b) => a.name.localeCompare(b.name));

/** Curated languages matching `query` by name OR code (for the autocomplete). */
export function matchLanguages(query: string, limit = 8): LanguageOption[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return LANGUAGE_OPTIONS.filter(
		(o) => o.name.toLowerCase().includes(q) || o.code.includes(q)
	).slice(0, limit);
}
