<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent',
		'data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground',
		'group-data-[orientation=horizontal]/tabs:after:-bottom-1.2 after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
		'group-data-[variant=connected]/tabs-list:-mb-px group-data-[variant=connected]/tabs-list:h-10 group-data-[variant=connected]/tabs-list:flex-none group-data-[variant=connected]/tabs-list:rounded-t-lg group-data-[variant=connected]/tabs-list:rounded-b-none group-data-[variant=connected]/tabs-list:px-4 group-data-[variant=connected]/tabs-list:py-2 group-data-[variant=connected]/tabs-list:after:hidden group-data-[variant=connected]/tabs-list:hover:bg-muted/40',
		'group-data-[variant=connected]/tabs-list:data-[state=active]:border-border group-data-[variant=connected]/tabs-list:data-[state=active]:border-b-background group-data-[variant=connected]/tabs-list:data-[state=active]:bg-background group-data-[variant=connected]/tabs-list:data-[state=active]:font-semibold group-data-[variant=connected]/tabs-list:data-[state=active]:shadow-none group-data-[variant=connected]/tabs-list:data-[state=active]:hover:bg-background dark:group-data-[variant=connected]/tabs-list:data-[state=active]:border-input dark:group-data-[variant=connected]/tabs-list:data-[state=active]:border-b-background dark:group-data-[variant=connected]/tabs-list:data-[state=active]:bg-background',
		className
	)}
	{...restProps}
/>
