<script lang="ts">
	import { formatMetricValue } from '$lib/benchmark-chart';
	import * as Chart from '$lib/components/ui/chart';

	interface Props {
		unit?: string;
		label?: string;
		labelFormatter?: (value: unknown) => string | number;
	}

	let { unit = '', label, labelFormatter }: Props = $props();
</script>

{#snippet tooltipValue({
	value,
	name,
	item
}: {
	value: unknown;
	name: string;
	item: { color?: string };
})}
	<div class="flex min-w-0 flex-1 items-center justify-between gap-4">
		<div class="flex min-w-0 items-center gap-2">
			<span
				class="size-2.5 shrink-0 rounded-[2px]"
				style:background-color={item.color ?? 'currentColor'}
			></span>
			<span class="max-w-64 truncate text-muted-foreground">{name}</span>
		</div>
		<span class="font-mono font-medium tabular-nums">
			{typeof value === 'number' ? formatMetricValue(value, unit) : String(value)}
		</span>
	</div>
{/snippet}

<Chart.Tooltip formatter={tooltipValue} {label} {labelFormatter} />
