<script lang="ts">
	import { fetchSources, SOURCES, candidateField, type SourceState } from '$lib/sources';
	import { toIsbn13 } from '$lib/isbn';

	type Kind = 'text' | 'number' | 'textarea' | 'list';
	const FIELDS: { key: string; label: string; kind: Kind }[] = [
		{ key: 'title', label: 'Title', kind: 'text' },
		{ key: 'subtitle', label: 'Subtitle', kind: 'text' },
		{ key: 'original_title', label: 'Original title', kind: 'text' },
		{ key: 'edition_name', label: 'Edition', kind: 'text' },
		{ key: 'published_by', label: 'Publisher', kind: 'text' },
		{ key: 'published_place', label: 'Place', kind: 'text' },
		{ key: 'published_year', label: 'Year', kind: 'number' },
		{ key: 'authors', label: 'Authors', kind: 'list' },
		{ key: 'editors', label: 'Editors', kind: 'list' },
		{ key: 'translators', label: 'Translators', kind: 'list' },
		{ key: 'illustrators', label: 'Illustrators', kind: 'list' },
		{ key: 'foreword', label: 'Foreword by', kind: 'list' },
		{ key: 'subjects', label: 'Subjects', kind: 'list' },
		{ key: 'languages', label: 'Languages', kind: 'text' },
		{ key: 'shelf_location', label: 'Shelf location', kind: 'text' },
		{ key: 'description', label: 'Description', kind: 'textarea' }
	];

	let isbn = $state('');
	let error = $state('');
	let states = $state<Record<string, SourceState>>({});
	let looked = $state(false);
	// The record being composed (col 1). List/textarea fields hold newline-joined text.
	const record = $state<Record<string, string>>(
		Object.fromEntries(FIELDS.map((f) => [f.key, '']))
	);

	function lookup() {
		error = '';
		const isbn13 = toIsbn13(isbn);
		if (!isbn13) {
			error = 'Not a valid ISBN.';
			return;
		}
		states = {};
		looked = true;
		fetchSources(isbn13, (name, state) => {
			states = { ...states, [name]: state };
		});
	}

	// What a source's cell shows; `copy` (when present) is filled into the record on click.
	function cell(state: SourceState | undefined, key: string): { text: string; copy?: string } {
		if (!state) return { text: '' };
		if (state.status === 'loading') return { text: '…' };
		if (state.status === 'error') return { text: 'unavailable' };
		if (!state.candidate) return { text: '—' };
		const f = candidateField(state.candidate, key);
		return f ? { text: f.display, copy: f.copy } : { text: '' };
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

{#if looked}
	<p class="text-xs italic text-slate-500 mb-2">
		Edit the record on the left, or click any source value to copy it in.
	</p>
	<table class="table-fixed text-xs border border-slate-500 w-full shadow-md">
		<thead class="font-sans">
			<tr class="bg-sky-600 text-white">
				<th class="w-2/12 p-2 border border-slate-300 text-left">Field</th>
				<th class="w-4/12 p-2 border border-slate-300 text-left">Your record</th>
				{#each SOURCES as s (s.name)}
					<th class="p-2 border border-slate-300 text-left">{s.name}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each FIELDS as f (f.key)}
				<tr class="odd:bg-slate-200 align-top">
					<th class="p-2 border border-slate-300 text-left font-sans">{f.label}</th>
					<td class="p-2 border border-slate-300">
						{#if f.kind === 'textarea'}
							<textarea class="border border-slate-400 rounded text-xs p-1 w-full" rows="3" bind:value={record[f.key]}></textarea>
						{:else if f.kind === 'list'}
							<textarea class="border border-slate-400 rounded text-xs p-1 w-full" rows="2" placeholder="one per line" bind:value={record[f.key]}></textarea>
						{:else}
							<input class="border border-slate-400 rounded-full text-xs p-1 w-full" type={f.kind === 'number' ? 'number' : 'text'} bind:value={record[f.key]} />
						{/if}
					</td>
					{#each SOURCES as s (s.name)}
						{@const c = cell(states[s.name], f.key)}
						<td class="p-2 border border-slate-300">
							{#if c.copy !== undefined}
								<button
									type="button"
									class="text-left hover:bg-sky-100 rounded px-1 cursor-pointer w-full"
									title="Click to copy into your record"
									onclick={() => (record[f.key] = c.copy!)}
								>{c.text}</button>
							{:else}
								<span class="text-slate-400">{c.text}</span>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
