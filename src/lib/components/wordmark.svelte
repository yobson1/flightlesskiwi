<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { cn } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		size?: 'default' | 'large';
	}

	let { class: className, size = 'default', ...restProps }: Props = $props();
</script>

<span
	class={cn(
		'inline-flex items-center font-semibold',
		size === 'large' ? 'gap-3 text-lg' : 'gap-2',
		className
	)}
	{...restProps}
>
	<img src={favicon} alt="" class={size === 'large' ? 'size-10' : 'size-8'} />
	<span>
		<span class="text-kiwi-brown">flightless</span><span class="text-kiwi-green">kiwi</span>
	</span>
</span>
