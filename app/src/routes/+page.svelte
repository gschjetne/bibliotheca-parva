<script lang="ts">
	type ResultBook = {
		id: number;
		title: string | null;
		subtitle: string | null;
		contributors: string;
		languages: string;
		shelf_location: string | null;
	};

	let query = $state('');
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

<div class="flex justify-between">
	<input
		class="border border-slate-500 shadow-inner rounded-full w-80 text-xs p-2 m-1"
		type="search"
		placeholder="Search"
		bind:value={query}
	/>
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
