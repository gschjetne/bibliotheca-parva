<script lang="ts">
	export type Contributor = { name: string; personId?: number };
	type Suggestion = { id: number; name: string };

	let { contributors = $bindable([]) }: { contributors: Contributor[] } = $props();
	let q = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Debounced lookup of existing people. oninput (not $effect) so programmatic
	// resets of `q` don't trigger a refetch.
	function oninput() {
		const s = q.trim();
		clearTimeout(timer);
		if (!s) {
			suggestions = [];
			return;
		}
		timer = setTimeout(async () => {
			const res = await fetch(`/api/suggest/contributors?q=${encodeURIComponent(s)}`);
			if (res.ok) suggestions = await res.json();
		}, 150);
	}

	function addExisting(p: Suggestion) {
		contributors = [...contributors, { name: p.name, personId: p.id }];
		q = '';
		suggestions = [];
	}
	function addNew() {
		const name = q.trim();
		if (name) contributors = [...contributors, { name }];
		q = '';
		suggestions = [];
	}
	function remove(i: number) {
		contributors = contributors.filter((_, idx) => idx !== i);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			suggestions[0] ? addExisting(suggestions[0]) : addNew();
		}
	}
</script>

<div class="relative">
	<div class="flex flex-wrap gap-1 mb-1">
		{#each contributors as c, i (i)}
			<span
				class="inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs {c.personId
					? 'border-sky-400 bg-sky-50'
					: 'border-slate-300 bg-white'}"
				title={c.personId ? 'Linked to an existing person' : 'New person'}
			>
				{c.name}
				<button type="button" class="text-slate-400 hover:text-red-600 cursor-pointer" onclick={() => remove(i)} aria-label="remove">×</button>
			</span>
		{/each}
	</div>
	<input
		class="border border-slate-400 rounded-full text-xs p-1 w-full"
		placeholder="add a name…"
		bind:value={q}
		{oninput}
		{onkeydown}
	/>
	{#if suggestions.length}
		<ul class="absolute z-10 bg-white border border-slate-300 rounded shadow w-full mt-1 max-h-48 overflow-auto">
			{#each suggestions as p (p.id)}
				<li>
					<button type="button" class="block w-full text-left px-2 py-1 text-xs hover:bg-sky-100 cursor-pointer" onclick={() => addExisting(p)}>
						{p.name} <span class="text-slate-400">· existing</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
