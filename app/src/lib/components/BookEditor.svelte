<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { fetchSources, SOURCES, candidateField, type SourceState } from '$lib/sources';
	import type { Candidate } from '$lib/providers';
	import { toIsbn13 } from '$lib/isbn';
	import LanguagePicker from './LanguagePicker.svelte';
	import ContributorPicker from './ContributorPicker.svelte';
	import SuggestInput from './SuggestInput.svelte';

	export type EditorBook = {
		id: number;
		title: string | null;
		subtitle: string | null;
		original_title: string | null;
		edition_name: string | null;
		description: string | null;
		isbn_13: string | null;
		isbn_10: string | null;
		published_by: string | null;
		published_place: string | null;
		published_year: number | null;
		languages: string | null;
		shelf_location: string | null;
		contributors: { name_as_printed: string; role: string; person_id: number | null }[];
		subjects: string[];
	};
	type Contributor = { name: string; personId?: number };

	let { book = null }: { book?: EditorBook | null } = $props();
	// One-time snapshot for initial state. The edit page remounts (via {#key})
	// when the book id changes, so this is re-snapshotted per book.
	const init = untrack(() => book);

	type Widget = 'text' | 'number' | 'textarea' | 'suggest' | 'role' | 'languages';
	type Row = { label: string; widget: Widget; cand?: keyof Candidate; key?: string; role?: string; endpoint?: string };
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

	let isbn = $state(init?.isbn_13 ?? init?.isbn_10 ?? '');
	let error = $state('');
	let looked = $state(false);
	let states = $state<Record<string, SourceState>>({});

	const rec = $state<Record<string, string>>({
		title: init?.title ?? '',
		subtitle: init?.subtitle ?? '',
		original_title: init?.original_title ?? '',
		edition_name: init?.edition_name ?? '',
		published_by: init?.published_by ?? '',
		published_place: init?.published_place ?? '',
		published_year: init?.published_year?.toString() ?? '',
		subjects: (init?.subjects ?? []).join('\n'),
		shelf_location: init?.shelf_location ?? '',
		description: init?.description ?? ''
	});
	let languages = $state<string[]>(init?.languages ? JSON.parse(init.languages) : []);
	const roles = $state<Record<string, Contributor[]>>({ author: [], editor: [], translator: [], illustrator: [], foreword: [] });
	for (const c of init?.contributors ?? []) {
		(roles[c.role] ??= []).push({ name: c.name_as_printed, personId: c.person_id ?? undefined });
	}

	onMount(() => {
		if (isbn) lookup();
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
		fetchSources(isbn13, (name, state) => (states = { ...states, [name]: state }));
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

	function buildInput() {
		return {
			title: rec.title, subtitle: rec.subtitle, original_title: rec.original_title,
			edition_name: rec.edition_name, description: rec.description, isbn,
			published_by: rec.published_by, published_place: rec.published_place,
			published_year: rec.published_year,
			languages, shelf_location: rec.shelf_location,
			subjects: rec.subjects.split('\n'),
			contributors: Object.entries(roles).flatMap(([role, list]) =>
				list.map((c) => ({ name: c.name, role, personId: c.personId }))
			)
		};
	}

	let saving = $state(false);
	async function save() {
		saving = true;
		error = '';
		const res = await fetch(book ? `/api/books/${book.id}` : '/api/books', {
			method: book ? 'PUT' : 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(buildInput())
		});
		saving = false;
		if (res.ok) {
			const { id } = (await res.json()) as { id?: number };
			goto(`/books/${id ?? book?.id}/edit`);
		} else {
			error = 'Save failed.';
		}
	}

	async function remove() {
		if (!book || !confirm('Delete this book?')) return;
		const res = await fetch(`/api/books/${book.id}`, { method: 'DELETE' });
		if (res.ok) goto('/');
	}
</script>

<h1 class="font-bold font-sans text-lg mb-3">{book ? 'Edit book' : 'Add a book'}</h1>

<form onsubmit={(e) => { e.preventDefault(); lookup(); }} class="mb-4">
	<input class="border border-slate-500 shadow-inner rounded-full text-xs p-2 m-1" placeholder="ISBN" bind:value={isbn} />
	<button class="border border-slate-500 bg-sky-600 text-white shadow-md p-2 m-1 font-sans font-bold text-xs uppercase rounded-full cursor-pointer" type="submit">Look up</button>
	{#if error}<span class="text-xs text-red-600">{error}</span>{/if}
</form>

{#if looked || book}
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

	<div class="mt-4">
		<button class="border border-slate-500 bg-sky-600 text-white shadow-md p-2 m-1 font-sans font-bold text-xs uppercase rounded-full cursor-pointer" onclick={save} disabled={saving}>
			{saving ? 'Saving…' : 'Save book'}
		</button>
		<a href="/" class="text-xs text-slate-500 ml-2">cancel</a>
		{#if book}
			<button class="border border-red-700 text-red-700 p-2 m-1 ml-4 font-sans font-bold text-xs uppercase rounded-full cursor-pointer" onclick={remove}>Delete</button>
		{/if}
	</div>
{/if}
