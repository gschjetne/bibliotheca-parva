<script lang="ts">
	// Free-text input with suggestions from an endpoint (publisher, place).
	// Not an entity — selecting just fills the text; you can always type freely.
	let {
		value = $bindable(''),
		endpoint,
		placeholder = ''
	}: { value: string; endpoint: string; placeholder?: string } = $props();

	let suggestions = $state<string[]>([]);
	let open = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function oninput() {
		const s = value.trim();
		clearTimeout(timer);
		if (!s) {
			suggestions = [];
			return;
		}
		timer = setTimeout(async () => {
			const res = await fetch(`${endpoint}?q=${encodeURIComponent(s)}`);
			if (res.ok) {
				suggestions = await res.json();
				open = true;
			}
		}, 150);
	}
	function pick(v: string) {
		value = v;
		open = false;
		suggestions = [];
	}
</script>

<div class="relative">
	<input
		class="border border-slate-400 rounded-full text-xs p-1 w-full"
		{placeholder}
		bind:value
		{oninput}
		onblur={() => setTimeout(() => (open = false), 150)}
	/>
	{#if open && suggestions.length}
		<ul class="absolute z-10 bg-white border border-slate-300 rounded shadow w-full mt-1 max-h-48 overflow-auto">
			{#each suggestions as s (s)}
				<li>
					<button type="button" class="block w-full text-left px-2 py-1 text-xs hover:bg-sky-100 cursor-pointer" onclick={() => pick(s)}>{s}</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
