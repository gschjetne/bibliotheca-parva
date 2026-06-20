// Normalise text for case- and accent-insensitive search.
//
// Lowercases and strips diacritics so "Åke Ohlmarks" matches "ake ohlmarks".
// Non-Latin scripts (e.g. Cyrillic) are lowercased but NOT transliterated:
// cross-script matching (Dostoevsky <-> Достоевский) is handled by storing
// multiple name_forms per person, not by folding. D1's COLLATE NOCASE is
// ASCII-only, which is why we fold ourselves and index the folded text.
export function fold(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}
