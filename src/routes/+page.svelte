<script lang="ts">
	import { goto } from '$app/navigation';
	import { isValidIsbn } from '$lib/isbn';

	type ResultBook = {
		id: number;
		title: string | null;
		subtitle: string | null;
		contributors: string;
		languages: string;
		shelf_location: string | null;
	};

	let query = $state('');
	let isbn = $state('');
	let isbnError = $state('');

	// Add-by-ISBN from the home page (as in the old app): blank -> add by hand;
	// invalid -> show an error here; valid -> the review screen, which looks it up.
	function add(e: SubmitEvent) {
		e.preventDefault();
		const raw = isbn.trim();
		if (!raw) {
			void goto('/add');
			return;
		}
		if (!isValidIsbn(raw)) {
			isbnError = `"${raw}" is not a valid ISBN.`;
			return;
		}
		void goto(`/add?isbn=${encodeURIComponent(raw)}`);
	}
	let results = $state<ResultBook[]>([]);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Debounced live search against the JSON API.
	$effect(() => {
		const q = query;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			if (!q.trim()) {
				results = [];
				return;
			}
			const res = await fetch(`/api/search?query=${encodeURIComponent(q)}`);
			if (res.ok) results = await res.json();
		}, 150);
	});
</script>

<div class="flex flex-wrap items-center justify-between gap-2">
	<input
		class="m-1 w-full rounded-full border border-slate-500 p-2 text-xs shadow-inner sm:w-80"
		type="search"
		placeholder="Search"
		bind:value={query}
	/>
	<form onsubmit={add}>
		<input
			class="border border-slate-500 shadow-inner rounded-full text-xs p-2 m-1"
			placeholder="ISBN"
			bind:value={isbn}
			oninput={() => (isbnError = '')}
		/>
		<button
			class="border border-slate-500 bg-sky-600 text-white shadow-md p-2 m-1 font-sans font-bold text-xs uppercase rounded-full cursor-pointer"
			type="submit">Add</button
		>
		{#if isbnError}<span class="text-xs text-red-600">{isbnError}</span>{/if}
	</form>
</div>

<!-- Language and Location are secondary, so they're dropped on narrow screens to
keep Title / Contributors / edit readable without horizontal scrolling. -->
<table class="mt-5 w-full table-fixed border border-slate-500 text-xs shadow-md">
	<thead class="font-sans">
		<tr class="bg-sky-600 text-white">
			<th class="w-5/12 border border-slate-300 p-2 md:w-4/12">Title</th>
			<th class="w-5/12 border border-slate-300 p-2 md:w-4/12">Contributors</th>
			<th class="hidden border border-slate-300 p-2 md:table-cell md:w-2/12">Language</th>
			<th class="hidden border border-slate-300 p-2 md:table-cell md:w-1/12">Location</th>
			<th class="w-2/12 border border-slate-300 p-2 md:w-1/12"></th>
		</tr>
	</thead>
	<tbody>
		{#each results as b (b.id)}
			<tr class="odd:bg-slate-200">
				<td class="border border-slate-300 p-2">
					<p class="font-bold">
						{#if b.title}{b.title}{:else}<span class="text-slate-400">Missing Title</span>{/if}
					</p>
					{#if b.subtitle}<p class="italic">{b.subtitle}</p>{/if}
				</td>
				<td class="border border-slate-300 p-2">{b.contributors}</td>
				<td class="hidden border border-slate-300 p-2 md:table-cell">{b.languages}</td>
				<td class="hidden border border-slate-300 p-2 md:table-cell">{b.shelf_location ?? ''}</td>
				<td class="border border-slate-300 p-2">
					<a class="text-sky-700 underline" href="/books/{b.id}/edit">edit</a>
				</td>
			</tr>
		{/each}
	</tbody>
</table>
