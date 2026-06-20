<script lang="ts">
	// Renders the app-level toast queue. Mounted once by the root layout so it
	// outlives the pages that raise toasts.
	import { toasts, dismissToast } from '$lib/toast.svelte';
</script>

{#if toasts.length}
	<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
		{#each toasts as t (t.id)}
			<div
				role="status"
				class="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-xs shadow-lg"
			>
				<span>{t.message}</span>
				{#if t.href}
					<a
						href={t.href}
						class="font-bold text-sky-700 underline"
						onclick={() => dismissToast(t.id)}
					>
						{t.linkText ?? 'Open'}
					</a>
				{/if}
				<button
					type="button"
					class="ml-1 text-slate-400 hover:text-slate-700 cursor-pointer"
					aria-label="dismiss"
					onclick={() => dismissToast(t.id)}>×</button
				>
			</div>
		{/each}
	</div>
{/if}
