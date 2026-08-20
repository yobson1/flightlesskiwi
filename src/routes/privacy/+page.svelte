<script lang="ts">
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import CookieIcon from '@lucide/svelte/icons/cookie';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import MailIcon from '@lucide/svelte/icons/mail';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Privacy · flightlesskiwi</title>
	<meta
		name="description"
		content="How flightlesskiwi collects, uses, shares, and retains account and benchmark data."
	/>
</svelte:head>

<div class="flex flex-col gap-8">
	<header>
		<p class="text-sm font-medium text-primary">Your data</p>
		<h1 class="text-3xl font-bold tracking-tight">Privacy</h1>
		<p class="mt-2 text-muted-foreground">
			flightlesskiwi collects and uses data only to provide, operate, and secure the benchmark
			sharing service. We do not use your data for advertising, marketing, cross-site tracking, or
			sale.
		</p>
		<p class="mt-3 text-sm text-muted-foreground">Last updated 30 July 2026.</p>
	</header>

	<section class="space-y-4" aria-labelledby="collect-heading">
		<div>
			<h2 id="collect-heading" class="text-2xl font-semibold tracking-tight">What we collect</h2>
			<p class="mt-1 text-muted-foreground">
				The information depends on whether you create an account and upload a benchmark.
			</p>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<KeyRoundIcon class="size-5" />
						Account and authentication
					</Card.Title>
					<Card.Description
						>Information needed to identify and secure your account.</Card.Description
					>
				</Card.Header>
				<Card.Content class="space-y-3 text-sm text-muted-foreground">
					<p>
						We store your username, email address, password hash, account creation time, and
						verification state. Your email is used for verification, sign-in, account recovery, and
						security or service messages. It is not displayed publicly.
					</p>
					<p>
						If you enable additional security, we store the information needed for sessions, email
						verification, password resets, authenticator codes, passkeys, recovery codes, and rate
						limiting. Passwords and recovery codes are stored as hashes; authenticator keys are
						encrypted. Passkeys provide a public key and device metadata, not your fingerprint,
						face, or device PIN.
					</p>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<DatabaseIcon class="size-5" />
						Benchmarks
					</Card.Title>
					<Card.Description>Information you choose to publish through the service.</Card.Description
					>
				</Card.Header>
				<Card.Content class="space-y-3 text-sm text-muted-foreground">
					<p>
						We store the selected game, title, description, original filenames, raw MangoHud or
						CapFrameX files, creation time, and the account that uploaded the benchmark. The service
						reads performance and system information from those uploaded files to build the public
						benchmark.
					</p>
					<p>
						Published benchmarks are associated with your public username. Their charts, hardware
						and software details, notes, filenames, and raw uploaded files are public and may be
						viewed or downloaded by anyone. Do not include secrets or personal information in an
						upload.
					</p>
				</Card.Content>
			</Card.Root>
		</div>
	</section>

	<section class="space-y-4" aria-labelledby="use-heading">
		<div>
			<h2 id="use-heading" class="text-2xl font-semibold tracking-tight">How we use data</h2>
			<p class="mt-1 text-muted-foreground">
				Every use is connected to providing or protecting flightlesskiwi.
			</p>
		</div>

		<Card.Root>
			<Card.Content class="grid gap-5 sm:grid-cols-2">
				<div>
					<h3 class="font-semibold">Provide the service</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						Create and recover accounts, authenticate requests, display profiles and benchmarks,
						generate charts and downloads, and make public benchmarks searchable.
					</p>
				</div>
				<div>
					<h3 class="font-semibold">Keep it secure and reliable</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						Prevent abuse, enforce request limits, verify human visitors, diagnose failures, and
						maintain the availability and integrity of the service.
					</p>
				</div>
			</Card.Content>
		</Card.Root>
	</section>

	<section class="space-y-4" aria-labelledby="cookies-heading">
		<div>
			<h2 id="cookies-heading" class="text-2xl font-semibold tracking-tight">Cookies</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<CookieIcon class="size-5" />
					Strictly necessary only
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm text-muted-foreground">
				<p>
					flightlesskiwi uses cookies only for authentication and account-security workflows. These
					include your signed-in session and short-lived sign-in, email-verification,
					password-reset, authenticator-setup, and recovery-code-setup state.
				</p>
				<p>
					We do not set advertising or analytics cookies. Authentication cookies are restricted with
					appropriate security attributes, including HTTP-only access and same-site rules.
					{#if data.turnstileEnabled}
						Cloudflare may use strictly necessary cookies when providing its security services, as
						described in Cloudflare’s policies.
					{/if}
				</p>
			</Card.Content>
		</Card.Root>
	</section>

	<section class="space-y-4" aria-labelledby="providers-heading">
		<div>
			<h2 id="providers-heading" class="text-2xl font-semibold tracking-tight">
				Service providers
			</h2>
			<p class="mt-1 text-muted-foreground">
				Some data is processed by providers that help deliver the service.
			</p>
		</div>

		<div class="space-y-4">
			{#if data.turnstileEnabled}
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<CloudIcon class="size-5" />
							Cloudflare
						</Card.Title>
						<Card.Description>Traffic proxying, security, and bot protection.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-3 text-sm text-muted-foreground">
						<p>
							flightlesskiwi is proxied through Cloudflare, so requests pass through Cloudflare’s
							network before reaching the service. Cloudflare necessarily processes network and
							request information such as IP addresses and HTTP request metadata to deliver and
							secure that traffic.
						</p>
						<p>
							Cloudflare Turnstile protects authentication and benchmark-upload actions. Cloudflare
							says Turnstile processes signals including the client IP address, TLS fingerprint,
							user-agent header, site key, and associated origin to distinguish people from bots and
							to improve its bot-detection capabilities.
						</p>
						<p>
							Read Cloudflare’s
							<a
								href="https://www.cloudflare.com/turnstile-privacy-policy/"
								target="_blank"
								rel="noopener noreferrer"
								class="font-medium text-foreground underline underline-offset-4"
							>
								Turnstile Privacy Addendum
							</a>
							and
							<a
								href="https://www.cloudflare.com/privacypolicy/"
								target="_blank"
								rel="noopener noreferrer"
								class="font-medium text-foreground underline underline-offset-4"
							>
								Privacy Policy
							</a>.
						</p>
					</Card.Content>
				</Card.Root>
			{/if}

			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<MailIcon class="size-5" />
						Email delivery
					</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm text-muted-foreground">
					<p>
						Our email delivery provider processes your email address and the content of verification
						or password-reset messages only to deliver those service emails.
					</p>
				</Card.Content>
			</Card.Root>
		</div>
	</section>

	<section class="space-y-4" aria-labelledby="technical-heading">
		<div>
			<h2 id="technical-heading" class="text-2xl font-semibold tracking-tight">
				Technical and security data
			</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<ShieldCheckIcon class="size-5" />
					Abuse prevention and diagnostics
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm text-muted-foreground">
				<p>
					The service processes your IP address for security checks and request limits. Persistent
					rate-limit records use one-way hashed identifiers and expire automatically. The service,
					its host{#if data.turnstileEnabled}, and Cloudflare{/if} may also retain limited technical or
					error logs needed to diagnose failures, prevent abuse, and keep the service available.
				</p>
				<p>
					We do not sell personal data or disclose it for advertising. Data is otherwise disclosed
					only when you publish it, to providers that operate the service.
				</p>
			</Card.Content>
		</Card.Root>
	</section>

	<section class="space-y-4" aria-labelledby="retention-heading">
		<div>
			<h2 id="retention-heading" class="text-2xl font-semibold tracking-tight">
				Retention and your choices
			</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Trash2Icon class="size-5" />
					You control your account and uploads
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm text-muted-foreground">
				<p>
					Account information is retained while your account exists. Benchmarks remain available
					until you delete them or delete your account. You can update account details, remove
					individual benchmarks, or delete your account from the site. Account deletion removes the
					account and its associated benchmark records and uploaded files from the live service.
				</p>
				<p>
					Short-lived sign-in, verification, recovery, challenge, and rate-limit records expire or
					are removed when they are no longer needed.
				</p>
			</Card.Content>
		</Card.Root>
	</section>

	{#if data.contactEmail}
		<section class="border-t pt-8" aria-labelledby="contact-heading">
			<h2 id="contact-heading" class="text-2xl font-semibold tracking-tight">
				Questions or requests
			</h2>
			<p class="mt-2 text-muted-foreground">
				For privacy questions or requests concerning your data, email
				<a
					href={`mailto:${data.contactEmail}`}
					class="font-medium text-foreground underline underline-offset-4"
				>
					{data.contactEmail}
				</a>. We may update this notice when the service or its providers change; the date at the
				top shows the latest revision.
			</p>
		</section>
	{/if}
</div>
