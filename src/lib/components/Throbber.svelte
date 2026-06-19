<script lang="ts">
	// Small library-themed loading animations, shown per bibliographic source
	// while its lookup is in flight. Inherits colour from `currentColor`.
	type ThrobberVariant = 'stack' | 'flip' | 'search';
	let { variant = 'stack', label = 'Fetching…' }: { variant?: ThrobberVariant; label?: string } =
		$props();
</script>

<span class="throbber" role="status" aria-label={label} title={label}>
	{#if variant === 'stack'}
		<!-- books being stacked: a shimmer running up the spines -->
		<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
			<rect class="sp sp1" x="3" y="15.4" width="18" height="3.4" rx="1.2" />
			<rect class="sp sp2" x="4" y="10.7" width="16" height="3.4" rx="1.2" />
			<rect class="sp sp3" x="6" y="6" width="12" height="3.4" rx="1.2" />
		</svg>
	{:else if variant === 'flip'}
		<!-- open book with a page turning across the spine -->
		<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
			<path d="M12 7C9 5.5 5.5 5.5 3 6.6L3 19C5.5 17.9 9 17.9 12 19.4Z" opacity=".5" />
			<path d="M12 7C15 5.5 18.5 5.5 21 6.6L21 19C18.5 17.9 15 17.9 12 19.4Z" opacity=".5" />
			<path class="pg" d="M12 7C15 5.5 18.5 5.5 21 6.6L21 19C18.5 17.9 15 17.9 12 19.4Z" />
		</svg>
	{:else}
		<!-- magnifier scanning the catalogue -->
		<svg
			viewBox="0 0 24 24"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<g class="mag">
				<circle cx="10.5" cy="10.5" r="5.3" />
				<line x1="14.5" y1="14.5" x2="19" y2="19" />
			</g>
		</svg>
	{/if}
</span>

<style>
	.throbber {
		display: inline-flex;
		line-height: 0;
		vertical-align: middle;
	}

	/* stacking books */
	.sp {
		transform-box: fill-box;
		transform-origin: left center;
		opacity: 0.3;
		animation: shimmer 1.1s infinite ease-in-out;
	}
	.sp2 {
		animation-delay: 0.15s;
	}
	.sp3 {
		animation-delay: 0.3s;
	}
	@keyframes shimmer {
		0%,
		100% {
			opacity: 0.3;
			transform: scaleX(0.85);
		}
		40% {
			opacity: 1;
			transform: scaleX(1);
		}
	}

	/* turning page */
	.pg {
		transform-box: fill-box;
		transform-origin: left center;
		animation: turn 1.2s infinite ease-in-out;
	}
	@keyframes turn {
		0%,
		100% {
			transform: scaleX(1);
			opacity: 1;
		}
		50% {
			transform: scaleX(-1);
			opacity: 0.7;
		}
	}

	/* scanning magnifier */
	.mag {
		transform-box: view-box;
		transform-origin: 10.5px 10.5px;
		animation: sweep 1.2s infinite ease-in-out;
	}
	@keyframes sweep {
		0%,
		100% {
			transform: translate(-2px, 1px) rotate(-12deg);
		}
		50% {
			transform: translate(2px, -1px) rotate(12deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sp,
		.pg,
		.mag {
			animation: none;
			opacity: 1;
		}
	}
</style>
