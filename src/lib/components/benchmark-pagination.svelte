<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import MoreHorizontalIcon from '@lucide/svelte/icons/more-horizontal';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Pagination from '$lib/components/ui/pagination';

	interface Props {
		count: number;
		page: number;
		pageSize: number;
		busy?: boolean;
		onPageSelect: (page: number) => void | Promise<void>;
	}

	let { count, page, pageSize, busy = false, onPageSelect }: Props = $props();
	let editingEllipsis = $state<string | null>(null);
	let jumpValue = $state('');
	let jumpInput = $state<HTMLInputElement>();
	let paginationRevision = $state(0);
	let rangeStart = $derived((page - 1) * pageSize + 1);
	let rangeEnd = $derived(Math.min(page * pageSize, count));

	async function selectPage(nextPage: number) {
		if (busy || nextPage === page) return;
		try {
			await onPageSelect(nextPage);
		} finally {
			paginationRevision += 1;
		}
	}

	async function editJump(key: string) {
		if (busy) return;
		editingEllipsis = key;
		jumpValue = page.toString();
		await tick();
		jumpInput?.focus();
		jumpInput?.select();
	}

	function closeJump() {
		editingEllipsis = null;
	}

	async function submitJump() {
		const requestedPage = Number(jumpValue);
		const totalPages = Math.max(1, Math.ceil(count / pageSize));
		if (!Number.isSafeInteger(requestedPage)) return;
		closeJump();
		await selectPage(Math.max(1, Math.min(requestedPage, totalPages)));
	}

	function handleJumpKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void submitJump();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			closeJump();
		}
	}
</script>

<div
	class="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 rounded-xl border bg-card/95 p-2 text-card-foreground shadow-lg backdrop-blur"
	aria-busy={busy}
>
	<p class="mb-1 text-center text-xs text-muted-foreground">
		Showing {rangeStart}–{rangeEnd} of {count}
	</p>
	{#key `${page}-${paginationRevision}`}
		<Pagination.Root
			{count}
			perPage={pageSize}
			{page}
			siblingCount={1}
			onPageChange={(nextPage) => void selectPage(nextPage)}
			class="w-auto"
		>
			{#snippet children({ pages, currentPage })}
				<Pagination.Content>
					<Pagination.Item>
						<Pagination.PrevButton class="size-8 p-0" disabled={busy}>
							<ChevronLeftIcon />
						</Pagination.PrevButton>
					</Pagination.Item>
					{#each pages as pageItem (pageItem.key)}
						<Pagination.Item>
							{#if pageItem.type === 'ellipsis'}
								{#if editingEllipsis === pageItem.key}
									<label class="block">
										<span class="sr-only">Jump to page</span>
										<input
											bind:this={jumpInput}
											type="text"
											inputmode="numeric"
											pattern="[0-9]*"
											autocomplete="off"
											value={jumpValue}
											oninput={(event) =>
												(jumpValue = event.currentTarget.value.replace(/\D/g, ''))}
											onkeydown={handleJumpKeydown}
											onblur={closeJump}
											class="size-8 rounded-lg border bg-background px-1 text-center text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
										/>
									</label>
								{:else}
									<Button
										variant="ghost"
										size="icon"
										class="size-8"
										aria-label="Jump to page"
										disabled={busy}
										onclick={() => void editJump(pageItem.key)}
									>
										<MoreHorizontalIcon />
									</Button>
								{/if}
							{:else}
								<Pagination.Link
									page={pageItem}
									isActive={currentPage === pageItem.value}
									size="icon"
									class="size-8"
									disabled={busy}
								/>
							{/if}
						</Pagination.Item>
					{/each}
					<Pagination.Item>
						<Pagination.NextButton class="size-8 p-0" disabled={busy}>
							<ChevronRightIcon />
						</Pagination.NextButton>
					</Pagination.Item>
				</Pagination.Content>
			{/snippet}
		</Pagination.Root>
	{/key}
</div>
