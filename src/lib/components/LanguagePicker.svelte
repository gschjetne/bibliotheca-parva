<script lang="ts">
	import { matchLanguages, languageName } from '$lib/languages';

	// `pending` mirrors the uncommitted free text so the parent can block saving
	// until it's turned into a chip (Enter) or cleared.
	let {
		codes = $bindable([]),
		pending = $bindable('')
	}: { codes: string[]; pending?: string } = $props();
	let q = $state('');
	const suggestions = $derived(matchLanguages(q));
	$effect(() => {
		pending = q.trim();
	});

	function add(code: string) {
		if (!codes.includes(code)) codes = [...codes, code];
		q = '';
	}
	function remove(code: string) {
		codes = codes.filter((c) => c !== code);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (suggestions[0]) add(suggestions[0].code);
		}
	}
</script>

<div class="relative">
	<div class="flex flex-wrap gap-1 mb-1">
		{#each codes as code (code)}
			<span class="inline-flex items-center gap-1 border border-slate-300 rounded-full bg-white px-2 py-0.5 text-xs">
				{languageName(code)}
				<button type="button" class="text-slate-400 hover:text-red-600 cursor-pointer" onclick={() => remove(code)} aria-label="remove">×</button>
			</span>
		{/each}
	</div>
	<input
		class="border border-slate-400 rounded-full text-xs p-1 w-full"
		placeholder="add a language…"
		bind:value={q}
		{onkeydown}
	/>
	{#if suggestions.length}
		<ul class="absolute z-10 bg-white border border-slate-300 rounded shadow w-full mt-1 max-h-48 overflow-auto">
			{#each suggestions as s (s.code)}
				<li>
					<button type="button" class="block w-full text-left px-2 py-1 text-xs hover:bg-sky-100 cursor-pointer" onclick={() => add(s.code)}>
						{s.name} <span class="text-slate-400">({s.code})</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
