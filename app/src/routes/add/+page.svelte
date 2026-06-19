<script lang="ts">
	import { fetchSources, SOURCES, candidateField, type SourceState } from '$lib/sources';
	import type { Candidate } from '$lib/providers';
	import { toIsbn13 } from '$lib/isbn';
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';
	import ContributorPicker from '$lib/components/ContributorPicker.svelte';
	import SuggestInput from '$lib/components/SuggestInput.svelte';

	type Widget = 'text' | 'number' | 'textarea' | 'suggest' | 'role' | 'languages';
	type Row = {
		label: string;
		widget: Widget;
		cand?: keyof Candidate; // source field, if any source provides it
		key?: string; // rec key (text/number/textarea/suggest)
		role?: string; // contribution role (role widget)
		endpoint?: string; // suggest widget
	};

	const ROWS: Row[] = [
		{ label: 'Title', widget: 'text', cand: 'title', key: 'title' },
		{ label: 'Subtitle', widget: 'text', cand: 'subtitle', key: 'subtitle' },
		{ label: 'Original title', widget: 'text', key: 'original_title' },
		{ label: 'Edition', widget: 'text', cand: 'edition_name', key: 'edition_name' },
		{ label: 'Publisher', widget: 'suggest', cand: 'published_by', key: 'published_by', endpoint: '/api/suggest/publishers' },
		{ label: 'Place', widget: 'suggest', cand: 'published_place', key: 'published_place', endpoint: '/api/suggest/places' },
		{ label: 'Year', widget: 'number', cand: 'published_year', key: 'published_year' },
		{ label: 'Authors', widget: 'role', cand: 'authors', role: 'author' },
		{ label: 'Editors', widget: 'role', cand: 'editors', role: 'editor' },
		{ label: 'Translators', widget: 'role', cand: 'translators', role: 'translator' },
		{ label: 'Illustrators', widget: 'role', cand: 'illustrators', role: 'illustrator' },
		{ label: 'Foreword by', widget: 'role', role: 'foreword' },
		{ label: 'Subjects', widget: 'textarea', cand: 'subjects', key: 'subjects' },
		{ label: 'Languages', widget: 'languages' },
		{ label: 'Shelf location', widget: 'text', key: 'shelf_location' },
		{ label: 'Description', widget: 'textarea', cand: 'description', key: 'description' }
	];

	type Contributor = { name: string; personId?: number };

	let isbn = $state('');
	let error = $state('');
	let looked = $state(false);
	let states = $state<Record<string, SourceState>>({});

	const rec = $state<Record<string, string>>({
		title: '', subtitle: '', original_title: '', edition_name: '',
		published_by: '', published_place: '', published_year: '',
		subjects: '', shelf_location: '', description: ''
	});
	let languages = $state<string[]>([]);
	const roles = $state<Record<string, Contributor[]>>({
		author: [], editor: [], translator: [], illustrator: [], foreword: []
	});

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

	function cell(state: SourceState | undefined, key?: keyof Candidate): { text: string; copy?: string } {
		if (!key || !state) return { text: '' };
		if (state.status === 'loading') return { text: '…' };
		if (state.status === 'error') return { text: 'unavailable' };
		if (!state.candidate) return { text: '—' };
		const f = candidateField(state.candidate, key);
		return f ? { text: f.display, copy: f.copy } : { text: '' };
	}

	function copyInto(row: Row, copy: string) {
		if (row.widget === 'role' && row.role) {
			roles[row.role] = copy.split('\n').filter(Boolean).map((name) => ({ name }));
		} else if (row.key) {
			rec[row.key] = copy;
		}
	}
</script>

<h1 class="font-bold font-sans text-lg mb-3">Add a book</h1>

<form onsubmit={(e) => { e.preventDefault(); lookup(); }} class="mb-4">
	<input class="border border-slate-500 shadow-inner rounded-full text-xs p-2 m-1" placeholder="ISBN" bind:value={isbn} />
	<button class="border border-slate-500 bg-sky-600 text-white shadow-md p-2 m-1 font-sans font-bold text-xs uppercase rounded-full cursor-pointer" type="submit">Look up</button>
	{#if error}<span class="text-xs text-red-600">{error}</span>{/if}
</form>

{#if looked}
	<p class="text-xs italic text-slate-500 mb-2">Edit the record on the left, or click any source value to copy it in.</p>
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
			{#each ROWS as row (row.label)}
				<tr class="odd:bg-slate-200 align-top">
					<th class="p-2 border border-slate-300 text-left font-sans">{row.label}</th>
					<td class="p-2 border border-slate-300">
						{#if row.widget === 'role' && row.role}
							<ContributorPicker bind:contributors={roles[row.role]} />
						{:else if row.widget === 'languages'}
							<LanguagePicker bind:codes={languages} />
						{:else if row.widget === 'suggest' && row.key && row.endpoint}
							<SuggestInput bind:value={rec[row.key]} endpoint={row.endpoint} />
						{:else if row.widget === 'textarea' && row.key}
							<textarea class="border border-slate-400 rounded text-xs p-1 w-full" rows="3" bind:value={rec[row.key]}></textarea>
						{:else if row.key}
							<input class="border border-slate-400 rounded-full text-xs p-1 w-full" type={row.widget === 'number' ? 'number' : 'text'} bind:value={rec[row.key]} />
						{/if}
					</td>
					{#each SOURCES as s (s.name)}
						{@const c = cell(states[s.name], row.cand)}
						<td class="p-2 border border-slate-300">
							{#if c.copy !== undefined}
								<button type="button" class="text-left hover:bg-sky-100 rounded px-1 cursor-pointer w-full" title="Click to copy into your record" onclick={() => copyInto(row, c.copy!)}>{c.text}</button>
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
