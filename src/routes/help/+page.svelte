<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
</script>

<svelte:head>
	<title>About · flightlesskiwi</title>
	<meta
		name="description"
		content="Recommended MangoHud and PresentMon capture settings for flightlesskiwi benchmarks."
	/>
</svelte:head>

<div class="flex flex-col gap-8">
	<header>
		<p class="text-sm font-medium text-primary">Create consistent benchmark captures</p>
		<h1 class="text-3xl font-bold tracking-tight">About</h1>
		<p class="mt-2 text-muted-foreground">
			flightlesskiwi turns raw MangoHud and PresentMon logs into benchmark pages that are easy to
			share and compare. Use the same capture frequency for every run so the charts represent your
			results consistently.
		</p>
	</header>

	<section id="capture-settings" class="scroll-mt-6 space-y-4" aria-labelledby="capture-heading">
		<div>
			<h2 id="capture-heading" class="text-2xl font-semibold tracking-tight">
				Recommended capture settings
			</h2>
			<p class="mt-1 text-muted-foreground">Configure these values before recording a benchmark.</p>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Description>Log / telemetry interval</Card.Description>
					<Card.Title class="text-3xl">25 ms</Card.Title>
				</Card.Header>
				<Card.Content class="text-muted-foreground">
					Records performance data 40 times per second.
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Description>Hardware polling frequency</Card.Description>
					<Card.Title class="text-3xl">40 Hz</Card.Title>
				</Card.Header>
				<Card.Content class="text-muted-foreground">
					This matches MangoHud's default hardware polling period.
				</Card.Content>
			</Card.Root>
		</div>
	</section>

	<section class="space-y-4" aria-labelledby="tools-heading">
		<div>
			<h2 id="tools-heading" class="text-2xl font-semibold tracking-tight">Configure your tool</h2>
			<p class="mt-1 text-muted-foreground">Apply the settings each tool you use.</p>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>MangoHud</Card.Title>
					<Card.Description>Set the logging interval in your configuration file.</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<ol class="list-decimal space-y-2 pl-5 text-muted-foreground marker:text-foreground">
						<li>
							Open
							<code class="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground"
								>~/.config/MangoHud/MangoHud.conf</code
							>.
						</li>
						<li>
							Add or update
							<code class="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground"
								>log_interval=25</code
							>.
						</li>
						<li>Save the file, then start logging for your benchmark run.</li>
					</ol>
					<p class="text-sm text-muted-foreground">
						See the
						<a
							href="https://github.com/flightlessmango/MangoHud"
							target="_blank"
							rel="noopener noreferrer"
							class="font-medium text-foreground underline underline-offset-4"
						>
							MangoHud documentation
						</a>
						for installation and logging options.
					</p>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>PresentMon</Card.Title>
					<Card.Description>Set both data collection frequencies in the app.</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<ol class="list-decimal space-y-2 pl-5 text-muted-foreground marker:text-foreground">
						<li>Open <span class="font-medium text-foreground">Settings → Data</span>.</li>
						<li>
							Set <span class="font-medium text-foreground">Polling rate</span> to
							<span class="font-medium text-foreground">40 Hz</span>.
						</li>
						<li>
							Set <span class="font-medium text-foreground">Telemetry period</span> to
							<span class="font-medium text-foreground">25 ms</span>.
						</li>
					</ol>
					<p class="text-sm text-muted-foreground">
						See the
						<a
							href="https://github.com/GameTechDev/PresentMon"
							target="_blank"
							rel="noopener noreferrer"
							class="font-medium text-foreground underline underline-offset-4"
						>
							PresentMon documentation
						</a>
						for installation and capture options.
					</p>
				</Card.Content>
			</Card.Root>
		</div>
	</section>

	<section class="space-y-4" aria-labelledby="upload-heading">
		<div>
			<h2 id="upload-heading" class="text-2xl font-semibold tracking-tight">Upload your result</h2>
			<p class="mt-1 text-muted-foreground">
				When the run is complete, upload the raw CSV output. You can include multiple runs to be
				compared and add notes about the hardware, graphics settings, test route, etc.
			</p>
		</div>

		<a
			href="/benchmark/new"
			class="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
		>
			Upload a benchmark
		</a>
	</section>

	<section class="border-t pt-8" aria-labelledby="about-heading">
		<h2 id="about-heading" class="text-2xl font-semibold tracking-tight">About flightlesskiwi</h2>
		<p class="mt-2 text-muted-foreground">
			flightlesskiwi is an open-source benchmark sharing site inspired by
			<a
				href="https://github.com/flightlessmango/flightlessmango.com"
				target="_blank"
				rel="noopener noreferrer"
				class="font-medium text-foreground underline underline-offset-4"
			>
				flightlessmango.com
			</a>
			and
			<a
				href="https://github.com/erkexzcx/flightlesssomething"
				target="_blank"
				rel="noopener noreferrer"
				class="font-medium text-foreground underline underline-offset-4"
			>
				flightlesssomething
			</a>. Its source code is available on
			<a
				href="https://github.com/yobson1/flightlesskiwi"
				target="_blank"
				rel="noopener noreferrer"
				class="font-medium text-foreground underline underline-offset-4"
			>
				GitHub
			</a>.
		</p>
	</section>
</div>
