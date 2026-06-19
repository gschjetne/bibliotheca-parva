// Client-side bibliographic source fetching. Each provider is fired
// independently (NOT awaited together) so the editor's source columns fill in
// progressively as each responds. Reuses the same parsers as the server
// (providers.ts) — they run in the browser; CORS is open on all three sources.
import { libris, openLibrary, bibbi, type Candidate, type Provider } from './providers';

export type SourceState = {
	status: 'loading' | 'done' | 'error';
	candidate: Candidate | null;
};

export const SOURCES: Provider[] = [libris, openLibrary, bibbi];

/**
 * Look up an ISBN at every source independently, reporting each via `onUpdate`
 * as it settles (`loading` first, then `done` with the candidate-or-null, or
 * `error`). Returns the per-source promises (handy for tests). `f` defaults to
 * the global fetch.
 */
export function fetchSources(
	isbn13: string,
	onUpdate: (name: string, state: SourceState) => void,
	f: typeof fetch = fetch
): Promise<void>[] {
	return SOURCES.map((p) => {
		onUpdate(p.name, { status: 'loading', candidate: null });
		return p
			.fetch(isbn13, f)
			.then((candidate) => onUpdate(p.name, { status: 'done', candidate }))
			.catch(() => onUpdate(p.name, { status: 'error', candidate: null }));
	});
}
