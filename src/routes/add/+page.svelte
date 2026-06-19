<script lang="ts">
	import BookEditor from '$lib/components/BookEditor.svelte';
	import { page } from '$app/state';

	// Carried from the home-page Add form; BookEditor auto-looks it up.
	const initialIsbn = page.url.searchParams.get('isbn') ?? '';
</script>

<BookEditor {initialIsbn} />
