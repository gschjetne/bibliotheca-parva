<script lang="ts">
	import BookEditor from '$lib/components/BookEditor.svelte';
	import { page } from '$app/state';

	// Carried from the home-page Add form; BookEditor auto-looks it up. With no
	// isbn this is a manual add: open a full blank book form to fill in by hand
	// (e.g. a book too old to have an ISBN), rather than just an ISBN field.
	const initialIsbn = page.url.searchParams.get('isbn') ?? '';
</script>

<BookEditor {initialIsbn} blank={!initialIsbn} />
