import { describe, it, expect } from 'vitest';
import { languageName, isRecognised, matchLanguages, LANGUAGE_OPTIONS } from './languages';

describe('languageName', () => {
	it('maps ISO 639-3 codes to names', () => {
		expect(languageName('eng')).toBe('English');
		expect(languageName('nob')).toBe('Norwegian Bokmål');
		expect(languageName('lat')).toBe('Latin');
	});
	it('falls back to the code for unrecognised input', () => {
		expect(languageName('zzz')).toBe('zzz');
	});
});

describe('isRecognised', () => {
	it('accepts real languages and rejects garbage', () => {
		expect(isRecognised('rus')).toBe(true);
		expect(isRecognised('xyz')).toBe(false);
	});
});

describe('matchLanguages (picker)', () => {
	it('matches by name', () => {
		expect(matchLanguages('russ').map((o) => o.code)).toContain('rus');
	});
	it('matches by code', () => {
		expect(matchLanguages('rus').map((o) => o.code)).toContain('rus');
	});
	it('offers English but not Klingon', () => {
		const codes = LANGUAGE_OPTIONS.map((o) => o.code);
		expect(codes).toContain('eng');
		expect(codes).not.toContain('tlh');
	});
	it('is empty for a blank query', () => {
		expect(matchLanguages('')).toEqual([]);
	});
});
