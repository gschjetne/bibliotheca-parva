<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, afterNavigate } from '$app/navigation';
	import { fetchSources, SOURCES, candidateField, type SourceState } from '$lib/sources';
	import type { Candidate } from '$lib/providers';
	import { toIsbn13 } from '$lib/isbn';
	import { showToast } from '$lib/toast.svelte';
	import LanguagePicker from './LanguagePicker.svelte';
	import ContributorPicker from './ContributorPicker.svelte';
	import SubjectPicker from './SubjectPicker.svelte';
	import SuggestInput from './SuggestInput.svelte';
	import Throbber from './Throbber.svelte';

	// One library-themed throbber per source column while it's fetching.
	const THROBBERS = ['flip', 'stack', 'search'] as const;

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

	// `blank` opens the full editor table with no lookup — a hand-entered book
	// (e.g. one too old to have an ISBN), filled in entirely by the librarian.
	let {
		book = null,
		initialIsbn = '',
		blank = false,
	}: { book?: EditorBook | null; initialIsbn?: string; blank?: boolean } = $props();
	// One-time snapshot for initial state. The edit page remounts (via {#key})
	// when the book id changes, so this is re-snapshotted per book.
	const init = untrack(() => book);

	type Widget = 'text' | 'number' | 'textarea' | 'suggest' | 'role' | 'languages' | 'subjects';
	type Row = {
		label: string;
		widget: Widget;
		cand?: keyof Candidate;
		key?: string;
		role?: string;
		endpoint?: string;
	};
	const ROWS: Row[] = [
		{ label: 'Title', widget: 'text', cand: 'title', key: 'title' },
		{ label: 'Subtitle', widget: 'text', cand: 'subtitle', key: 'subtitle' },
		{ label: 'Original title', widget: 'text', key: 'original_title' },
		{ label: 'Edition', widget: 'text', cand: 'edition_name', key: 'edition_name' },
		{
			label: 'Publisher',
			widget: 'suggest',
			cand: 'published_by',
			key: 'published_by',
			endpoint: '/api/suggest/publishers',
		},
		{
			label: 'Place',
			widget: 'suggest',
			cand: 'published_place',
			key: 'published_place',
			endpoint: '/api/suggest/places',
		},
		{ label: 'Year', widget: 'number', cand: 'published_year', key: 'published_year' },
		{ label: 'Authors', widget: 'role', cand: 'authors', role: 'author' },
		{ label: 'Editors', widget: 'role', cand: 'editors', role: 'editor' },
		{ label: 'Translators', widget: 'role', cand: 'translators', role: 'translator' },
		{ label: 'Illustrators', widget: 'role', cand: 'illustrators', role: 'illustrator' },
		{ label: 'Foreword by', widget: 'role', role: 'foreword' },
		{ label: 'Subjects', widget: 'subjects', cand: 'subjects' },
		{ label: 'Languages', widget: 'languages' },
		{ label: 'Shelf location', widget: 'text', key: 'shelf_location' },
		{ label: 'Description', widget: 'textarea', cand: 'description', key: 'description' },
	];

	// Pre-filled from the book being edited, or from the home-page Add form
	// (/add?isbn=…); a non-empty value auto-runs the lookup onMount.
	let isbn = $state(init?.isbn_13 ?? init?.isbn_10 ?? untrack(() => initialIsbn));
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
		shelf_location: init?.shelf_location ?? '',
		description: init?.description ?? '',
	});
	let languages = $state<string[]>(init?.languages ? JSON.parse(init.languages) : []);
	let subjects = $state<string[]>([...(init?.subjects ?? [])]);
	const roles = $state<Record<string, Contributor[]>>({
		author: [],
		editor: [],
		translator: [],
		illustrator: [],
		foreword: [],
	});

	// Uncommitted free text held by each chip widget (a name/subject/language
	// typed but not yet turned into a chip with Enter). Saving with text still
	// loose would silently drop it, so we block the save until every field is
	// either chipped or cleared.
	const rolePending = $state<Record<string, string>>({
		author: '',
		editor: '',
		translator: '',
		illustrator: '',
		foreword: '',
	});
	let subjectsPending = $state('');
	let languagesPending = $state('');
	const hasPendingText = $derived(
		[...Object.values(rolePending), subjectsPending, languagesPending].some((t) => t.trim() !== ''),
	);
	for (const c of init?.contributors ?? []) {
		(roles[c.role] ??= []).push({ name: c.name_as_printed, personId: c.person_id ?? undefined });
	}

	// Remember the page the librarian arrived from (e.g. the search results) so
	// saving an edit can hand them back there instead of stranding them on the
	// form. Null after a fresh page load — there is no in-app page to return to.
	let cameFrom: string | null = null;
	afterNavigate(({ from, to }) => {
		if (from && from.url.pathname !== to?.url.pathname) {
			cameFrom = from.url.pathname + from.url.search;
		}
	});

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
		// Fire-and-forget: results stream in via the callback, not the return value.
		void fetchSources(isbn13, (name, state) => (states = { ...states, [name]: state }));
	}

	function cell(
		state: SourceState | undefined,
		key?: keyof Candidate,
	): { text: string; copy?: string } {
		if (!key || !state) return { text: '' };
		// While loading, cells stay blank — the per-source throbber in the column
		// header is the single loading signal.
		if (state.status === 'loading') return { text: '' };
		if (state.status === 'error') return { text: 'unavailable' };
		if (!state.candidate) return { text: '—' };
		const f = candidateField(state.candidate, key);
		return f ? { text: f.display, copy: f.copy } : { text: '' };
	}

	function copyInto(row: Row, copy: string) {
		if (row.widget === 'role' && row.role) {
			roles[row.role] = copy
				.split('\n')
				.filter(Boolean)
				.map((name) => ({ name }));
		} else if (row.widget === 'subjects') {
			subjects = copy.split('\n').filter(Boolean);
		} else if (row.key) {
			rec[row.key] = copy;
		}
	}

	function buildInput() {
		return {
			title: rec.title,
			subtitle: rec.subtitle,
			original_title: rec.original_title,
			edition_name: rec.edition_name,
			description: rec.description,
			isbn,
			published_by: rec.published_by,
			published_place: rec.published_place,
			published_year: rec.published_year,
			languages,
			shelf_location: rec.shelf_location,
			subjects,
			contributors: Object.entries(roles).flatMap(([role, list]) =>
				list.map((c) => ({ name: c.name, role, personId: c.personId })),
			),
		};
	}

	let saving = $state(false);
	async function save() {
		saving = true;
		error = '';
		const res = await fetch(book ? `/api/books/${book.id}` : '/api/books', {
			method: book ? 'PUT' : 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(buildInput()),
		});
		saving = false;
		if (!res.ok) {
			error = 'Save failed.';
			return;
		}
		// Return the librarian to wherever they came from so they can move straight
		// on to the next book in the stack — both when editing an existing record
		// and after adding a new one. A toast (rendered by the layout, so it
		// survives this navigation) confirms the save and links back to the record
		// in case they want to keep editing it.
		const savedId = book ? book.id : ((await res.json()) as { id?: number }).id;
		showToast({
			message: 'Book saved.',
			href: `/books/${savedId}/edit`,
			linkText: 'Continue editing',
		});
		if (cameFrom !== null) history.back();
		else await goto('/');
	}

	async function remove() {
		if (!book || !confirm('Delete this book?')) return;
		const res = await fetch(`/api/books/${book.id}`, { method: 'DELETE' });
		if (res.ok) await goto('/');
	}
</script>

<h1 class="font-bold font-sans text-lg mb-3">{book ? 'Edit book' : 'Add a book'}</h1>

<form
	onsubmit={(e) => {
		e.preventDefault();
		lookup();
	}}
	class="mb-4"
>
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

{#if looked || book || blank}
	<table class="table-fixed text-xs border border-slate-500 w-full shadow-md">
		<thead class="font-sans">
			<tr class="bg-sky-600 text-white">
				<th class="w-2/12 p-2 border border-slate-300 text-left">Field</th>
				<th class="w-4/12 p-2 border border-slate-300 text-left">Your record</th>
				{#each SOURCES as s, i (s.name)}
					<th class="p-2 border border-slate-300 text-left">
						<span class="inline-flex items-center gap-1.5">
							{s.name}
							{#if states[s.name]?.status === 'loading'}
								<Throbber
									variant={THROBBERS[i % THROBBERS.length]}
									label={`Fetching from ${s.name}…`}
								/>
							{/if}
						</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each ROWS as row (row.label)}
				<tr class="odd:bg-slate-200 align-top">
					<th class="p-2 border border-slate-300 text-left font-sans">{row.label}</th>
					<td class="p-2 border border-slate-300">
						{#if row.widget === 'role' && row.role}
							<ContributorPicker
								bind:contributors={roles[row.role]}
								bind:pending={rolePending[row.role]}
							/>
						{:else if row.widget === 'languages'}
							<LanguagePicker bind:codes={languages} bind:pending={languagesPending} />
						{:else if row.widget === 'subjects'}
							<SubjectPicker bind:subjects bind:pending={subjectsPending} />
						{:else if row.widget === 'suggest' && row.key && row.endpoint}
							<SuggestInput bind:value={rec[row.key]} endpoint={row.endpoint} />
						{:else if row.widget === 'textarea' && row.key}
							<textarea
								name={row.key}
								class="border border-slate-400 rounded text-xs p-1 w-full"
								rows="3"
								bind:value={rec[row.key]}></textarea>
						{:else if row.key}
							<input
								name={row.key}
								class="border border-slate-400 rounded-full text-xs p-1 w-full"
								type={row.widget === 'number' ? 'number' : 'text'}
								bind:value={rec[row.key]}
							/>
						{/if}
					</td>
					{#each SOURCES as s (s.name)}
						{@const c = cell(states[s.name], row.cand)}
						<td class="p-2 border border-slate-300">
							{#if c.copy !== undefined}
								<button
									type="button"
									class="text-left hover:bg-sky-100 rounded px-1 cursor-pointer w-full"
									title="Click to copy into your record"
									onclick={() => copyInto(row, c.copy!)}>{c.text}</button
								>
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
		<button
			class="border border-slate-500 bg-sky-600 text-white shadow-md p-2 m-1 font-sans font-bold text-xs uppercase rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
			onclick={save}
			disabled={saving || hasPendingText}
		>
			{saving ? 'Saving…' : 'Save book'}
		</button>
		<a href="/" class="text-xs text-slate-500 ml-2">cancel</a>
		{#if book}
			<button
				class="border border-red-700 text-red-700 p-2 m-1 ml-4 font-sans font-bold text-xs uppercase rounded-full cursor-pointer"
				onclick={remove}>Delete</button
			>
		{/if}
		{#if hasPendingText}
			<p class="text-xs text-red-600 mt-1">
				A name, subject, or language has been typed but not yet added. Press Enter to turn it into a
				chip, or clear the field, before saving.
			</p>
		{/if}
	</div>
{/if}
