<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
</script>

<svelte:head>
	<title>About · flightlesskiwi</title>
	<meta
		name="description"
		content="Recommended MangoHud and CapFrameX capture settings for flightlesskiwi benchmarks."
	/>
</svelte:head>

<div class="flex flex-col gap-8">
	<header>
		<p class="text-sm font-medium text-primary">Create consistent benchmark captures</p>
		<h1 class="text-3xl font-bold tracking-tight">About</h1>
		<p class="mt-2 text-muted-foreground">
			flightlesskiwi turns raw MangoHud and CapFrameX logs into benchmark pages that are easy to
			share and compare. Follow the tool-specific capture settings below so your results contain
			consistent performance and hardware data.
		</p>
	</header>

	<section id="configure-your-tool" class="scroll-mt-6 space-y-4" aria-labelledby="tools-heading">
		<div>
			<h2 id="tools-heading" class="text-2xl font-semibold tracking-tight">Configure your tool</h2>
			<p class="mt-1 text-muted-foreground">Apply the settings for the tool you use.</p>
		</div>

		<div class="space-y-4">
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
								>log_interval=0</code
							>.
						</li>
						<li>This records every presented frame, matching CapFrameX's capture behavior.</li>
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
					<Card.Title>CapFrameX</Card.Title>
					<Card.Description>
						Leave sensor polling at 250ms and change the selected sensors only.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<ol class="list-decimal space-y-2 pl-5 text-muted-foreground marker:text-foreground">
						<li>Open the <span class="font-medium text-foreground">Sensor</span> view.</li>
						<li>Select only the sensors listed below, then save the selection.</li>
					</ol>

					<div>
						<p class="mb-2 font-medium">Sensors to enable</p>
						<ul class="grid gap-x-8 gap-y-2 text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
							<li><span class="font-medium text-foreground">CPU Total</span> · Load</li>
							<li><span class="font-medium text-foreground">CPU Max</span> · Clock</li>
							<li><span class="font-medium text-foreground">CPU Package</span> · Power</li>
							<li>
								<span class="font-medium text-foreground">CPU Package (Tctl/Tdie)</span> · Temperature
							</li>
							<li><span class="font-medium text-foreground">GPU Core</span> · Load</li>
							<li><span class="font-medium text-foreground">GPU Core</span> · Temperature</li>
							<li><span class="font-medium text-foreground">GPU Core</span> · Clock</li>
							<li><span class="font-medium text-foreground">GPU Memory</span> · Clock</li>
							<li><span class="font-medium text-foreground">GPU TBP</span> · Power</li>
							<li>
								<span class="font-medium text-foreground">GPU Memory Dedicated</span> · Data
							</li>
							<li><span class="font-medium text-foreground">RAM Used</span> · Data</li>
							<li><span class="font-medium text-foreground">RAM Game Used</span> · Data</li>
						</ul>
					</div>

					<p class="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
						Disable every other sensor. In particular, disable
						<span class="font-medium text-foreground">CPU Max · Load</span>, which CapFrameX enables
						by default. <span class="font-medium text-foreground">CPU Total · Load</span> matches
						MangoHud's <code>cpu_load</code>; CPU Max reports the load of the most heavily used CPU
						core and is not equivalent. Keep
						<span class="font-medium text-foreground">CPU Max · Clock</span>
						enabled because it matches MangoHud's <code>cpu_mhz</code>.
					</p>

					<p class="text-sm text-muted-foreground">
						<span class="font-medium text-foreground">RAM Game Used</span> is the closest CapFrameX equivalent
						to MangoHud's process resident memory measurement. CapFrameX records the game's private working
						set, while MangoHud records the full resident set, so the values are comparable but will not
						be identical.
					</p>

					<p class="text-sm text-muted-foreground">
						See the
						<a
							href="https://github.com/CXWorld/CapFrameX"
							target="_blank"
							rel="noopener noreferrer"
							class="font-medium text-foreground underline underline-offset-4"
						>
							CapFrameX documentation
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
				When the run is complete, upload the raw CSV or JSON output. You can include multiple runs
				to be compared and add notes about the hardware, graphics settings, test route, etc.
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
