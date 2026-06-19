<script lang="ts">
	import { fetchSources, SOURCES, type SourceState } from '$lib/sources';
	import type { Candidate } from '$lib/providers';
	import { toIsbn13 } from '$lib/isbn';

	let isbn = $state('');
	let error = $state('');
	let states = $state<Record<string, SourceState>>({});

	const FIELDS: [keyof Candidate, string][] = [
		['title', 'Title'],
		['subtitle', 'Subtitle'],
		['edition_name', 'Edition'],
		['published_by', 'Publisher'],
		['published_place', 'Place'],
		['published_year', 'Year'],
		['authors', 'Authors'],
		['editors', 'Editors'],
		['translators', 'Translators'],
		['illustrators', 'Illustrators'],
		['subjects', 'Subjects'],
		['description', 'Description']
	];

	function lookup() {
		error = '';
		const isbn13 = toIsbn13(isbn);
		if (!isbn13) {
			error = 'Not a valid ISBN.';
			return;
		}
		states = {};
		// Each source updates its column independently as it returns.
		fetchSources(isbn13, (name, state) => {
			states = { ...states, [name]: state };
		});
	}

	function cell(state: SourceState | undefined, key: keyof Candidate): string {
		if (!state) return '';
		if (state.status === 'loading') return '…';
		if (state.status === 'error') return 'unavailable';
		const c = state.candidate;
		if (!c) return '—';
		const v = c[key];
		return Array.isArray(v) ? v.join(', ') : (v ?? '').toString();
	}
</script>

<h1 class="font-bold font-sans text-lg mb-3">Add a book</h1>

<form onsubmit={(e) => { e.preventDefault(); lookup(); }} class="mb-4">
	<input
		class="border border-slate-500 shadow-inner rounded-full text-xs p-2 m-1"
		placeholder="ISBN"
		bind:value={isbn}
	/>
	<button
		class="border border-slate-500 bg-sky-600 text-white shadow-md p-2 m-1 font-sans font-bold text-xs uppercase rounded-full cursor-pointer"
		type="submit">Look up</button
	>
	{#if error}<span class="text-xs text-red-600">{error}</span>{/if}
</form>

{#if Object.keys(states).length}
	<table class="table-fixed text-xs border border-slate-500 w-full shadow-md">
		<thead class="font-sans">
			<tr class="bg-sky-600 text-white">
				<th class="w-2/12 p-2 border border-slate-300 text-left">Field</th>
				{#each SOURCES as s (s.name)}
					<th class="p-2 border border-slate-300 text-left">{s.name}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each FIELDS as [key, label] (key)}
				<tr class="odd:bg-slate-200 align-top">
					<th class="p-2 border border-slate-300 text-left font-sans">{label}</th>
					{#each SOURCES as s (s.name)}
						<td class="p-2 border border-slate-300">{cell(states[s.name], key)}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
