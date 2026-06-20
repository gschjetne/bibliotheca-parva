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

<div class="flex justify-between items-center">
	<input
		class="border border-slate-500 shadow-inner rounded-full w-80 text-xs p-2 m-1"
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

<table class="table-fixed text-xs border border-slate-500 mt-5 w-full shadow-md">
	<thead class="font-sans">
		<tr class="bg-sky-600 text-white">
			<th class="w-4/12 p-2 border border-slate-300">Title</th>
			<th class="w-4/12 p-2 border border-slate-300">Contributors</th>
			<th class="w-2/12 p-2 border border-slate-300">Language</th>
			<th class="w-1/12 p-2 border border-slate-300">Location</th>
			<th class="w-1/12 p-2 border border-slate-300"></th>
		</tr>
	</thead>
	<tbody>
		{#each results as b (b.id)}
			<tr class="odd:bg-slate-200">
				<td class="p-2 border border-slate-300">
					<p class="font-bold">
						{#if b.title}{b.title}{:else}<span class="text-slate-400">Missing Title</span>{/if}
					</p>
					{#if b.subtitle}<p class="italic">{b.subtitle}</p>{/if}
				</td>
				<td class="p-2 border border-slate-300">{b.contributors}</td>
				<td class="p-2 border border-slate-300">{b.languages}</td>
				<td class="p-2 border border-slate-300">{b.shelf_location ?? ''}</td>
				<td class="p-2 border border-slate-300">
					<a class="text-sky-700 underline" href="/books/{b.id}/edit">edit</a>
				</td>
			</tr>
		{/each}
	</tbody>
</table>
