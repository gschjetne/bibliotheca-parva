<script lang="ts">
	import BookEditor from '$lib/components/BookEditor.svelte';
	let { data } = $props();
</script>

<!-- Remount when navigating to a different book so the editor re-initialises. -->
{#key data.book.id}
	<BookEditor book={data.book} />
{/key}
