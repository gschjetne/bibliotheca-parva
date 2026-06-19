import { describe, it, expect } from 'vitest';
import { fetchSources, type SourceState } from './sources';

const ISBN = '9780261103573';

function mockFetch(routes: Record<string, { status?: number; body: string }>) {
	return (async (url: string | URL | Request) => {
		const u = String(url);
		for (const [needle, r] of Object.entries(routes)) {
			if (u.includes(needle)) return new Response(r.body, { status: r.status ?? 200 });
		}
		return new Response('', { status: 404 });
	}) as typeof fetch;
}

describe('fetchSources (progressive, per-source)', () => {
	it('reports loading then a result for each source independently', async () => {
		const f = mockFetch({
			[`/isbn/${ISBN}.json`]: {
				body: JSON.stringify({ title: 'Fellowship of the Ring' })
			},
			'libris.kb.se': {
				body: ['T1 The Fellowship of the Ring', `SN ${ISBN}`].join('\r\n')
			}
			// bibbi: no route -> 404 -> null
		});

		const calls: Record<string, SourceState[]> = {};
		const onUpdate = (name: string, state: SourceState) => {
			(calls[name] ??= []).push(state);
		};

		await Promise.all(fetchSources(ISBN, onUpdate, f));

		// Each source emits loading first, then a terminal state.
		for (const name of ['Libris', 'Open Library', 'Bibbi']) {
			expect(calls[name][0].status).toBe('loading');
			expect(calls[name].at(-1)!.status).toBe('done');
		}
		expect(calls['Libris'].at(-1)!.candidate?.title).toBe('The Fellowship of the Ring');
		expect(calls['Open Library'].at(-1)!.candidate?.title).toBe('Fellowship of the Ring');
		expect(calls['Bibbi'].at(-1)!.candidate).toBeNull(); // not found
	});

	it('reports error when a source throws (and not others)', async () => {
		const f = (async (url: string | URL | Request) => {
			if (String(url).includes('libris.kb.se')) throw new Error('network down');
			return new Response('', { status: 404 });
		}) as typeof fetch;

		const states: Record<string, SourceState> = {};
		await Promise.all(fetchSources(ISBN, (n, s) => (states[n] = s), f));

		expect(states['Libris'].status).toBe('error');
		expect(states['Open Library'].status).toBe('done');
		expect(states['Bibbi'].status).toBe('done');
	});
});
