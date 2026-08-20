<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import HouseIcon from '@lucide/svelte/icons/house';
	import { page } from '$app/state';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import ShaderRenderer from '#lib/components/shader-renderer.svelte';
	import fragShaderSource from '#lib/shaders/isovalues/frag.glsl?raw';
	import vertShaderSource from '#lib/shaders/isovalues/vert.glsl?raw';

	const title = $derived(page.error?.message ?? 'Request failed');
	const errorCodeLabel = $derived(title.toUpperCase().replaceAll(' ', '_'));
	const description = $derived(
		page.status === 404
			? 'The page may have moved, been removed, or never existed.'
			: 'We hit an unexpected problem while loading this page. Try again, or head back to safety.'
	);

	function goBack() {
		if (window.history.length > 1) {
			window.history.back();
		} else {
			window.location.assign('/');
		}
	}
</script>

<svelte:head>
	<title>{page.status} · {title} · flightlesskiwi</title>
	<meta name="description" content={description} />
	<meta name="robots" content="noindex" />
</svelte:head>

<section
	class="grid min-h-[clamp(28rem,65vh,44rem)] place-items-center py-6"
	aria-labelledby="error-title"
>
	<Card.Root class="w-full max-w-3xl py-0">
		<div class="grid md:grid-cols-[15rem_1fr]">
			<div
				class="relative hidden min-h-96 place-items-center overflow-hidden border-r bg-muted/35 md:grid"
				aria-hidden="true"
			>
				<div class="absolute inset-0 opacity-[0.11] dark:opacity-[0.07]">
					<ShaderRenderer
						{vertShaderSource}
						{fragShaderSource}
						class="absolute inset-0 size-full invert dark:invert-0"
					/>
				</div>
				<span class="absolute top-5 left-5 font-mono text-xs text-muted-foreground">
					ERR/{page.status}
				</span>
				<div class="relative grid place-items-center">
					<span class="text-8xl font-bold tracking-tighter text-foreground/10">
						{page.status}
					</span>
				</div>
				<span class="absolute right-5 bottom-5 font-mono text-xs text-muted-foreground">
					{errorCodeLabel}
				</span>
			</div>

			<div class="flex min-h-96 min-w-0 flex-col">
				<Card.Header class="gap-4 px-6 pt-8 sm:px-8">
					<Badge variant="destructive">Error {page.status}</Badge>
					<div class="space-y-2">
						<Card.Title id="error-title" class="text-3xl font-bold tracking-tight">
							{title}
						</Card.Title>
						<Card.Description class="max-w-md text-base leading-relaxed">
							{description}
						</Card.Description>
					</div>
				</Card.Header>

				<Card.Content class="flex-1 px-6 sm:px-8"></Card.Content>

				<Card.Footer
					class="flex flex-col items-stretch gap-2 rounded-b-xl px-6 py-5 sm:flex-row sm:px-8 md:rounded-bl-none"
				>
					<Button href="/" size="lg">
						<HouseIcon />
						Back to home
					</Button>
					<Button variant="outline" size="lg" onclick={goBack}>
						<ArrowLeftIcon />
						Go back
					</Button>
				</Card.Footer>
			</div>
		</div>
	</Card.Root>
</section>
