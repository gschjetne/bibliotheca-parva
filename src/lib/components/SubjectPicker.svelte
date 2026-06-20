<script lang="ts">
	// Chips + autocomplete for subjects. Unlike contributors these are not
	// entities with identity — each chip is just a name string, deduped on save.
	// Suggestions reuse spellings already in the catalogue (/api/suggest/subjects).
	// `pending` mirrors the uncommitted free text so the parent can block saving
	// until it's turned into a chip (Enter) or cleared.
	let {
		subjects = $bindable([]),
		pending = $bindable(''),
	}: { subjects: string[]; pending?: string } = $props();
	let q = $state('');
	let suggestions = $state<string[]>([]);
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		pending = q.trim();
	});

	function add(name: string) {
		const n = name.trim();
		// Case-insensitive de-dup against what's already chipped.
		if (n && !subjects.some((s) => s.toLowerCase() === n.toLowerCase())) {
			subjects = [...subjects, n];
		}
		q = '';
		suggestions = [];
	}
	function remove(i: number) {
		subjects = subjects.filter((_, idx) => idx !== i);
	}
	function oninput() {
		const s = q.trim();
		clearTimeout(timer);
		if (!s) {
			suggestions = [];
			return;
		}
		timer = setTimeout(async () => {
			const res = await fetch(`/api/suggest/subjects?q=${encodeURIComponent(s)}`);
			if (res.ok) {
				const list = (await res.json()) as string[];
				suggestions = list.filter((name) => !subjects.includes(name));
			}
		}, 150);
	}
	function onkeydown(e: KeyboardEvent) {
		// Enter records exactly what's typed (free text); pick from the list by click.
		if (e.key === 'Enter') {
			e.preventDefault();
			add(q);
		}
	}
</script>

<div class="relative">
	<div class="flex flex-wrap gap-1 mb-1">
		{#each subjects as s, i (i)}
			<span
				class="inline-flex items-center gap-1 border border-amber-400 bg-amber-50 rounded-full px-2 py-0.5 text-xs"
			>
				{s}
				<button
					type="button"
					class="text-slate-400 hover:text-red-600 cursor-pointer"
					onclick={() => remove(i)}
					aria-label="remove">×</button
				>
			</span>
		{/each}
	</div>
	<input
		class="border border-slate-400 rounded-full text-xs p-1 w-full"
		placeholder="add a subject…"
		bind:value={q}
		{oninput}
		{onkeydown}
	/>
	{#if suggestions.length}
		<ul
			class="absolute z-10 bg-white border border-slate-300 rounded shadow w-full mt-1 max-h-48 overflow-auto"
		>
			{#each suggestions as s (s)}
				<li>
					<button
						type="button"
						class="block w-full text-left px-2 py-1 text-xs hover:bg-amber-100 cursor-pointer"
						onclick={() => add(s)}
					>
						{s} <span class="text-slate-400">· existing</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
