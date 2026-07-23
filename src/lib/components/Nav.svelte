<script lang="ts">
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import SunIcon from '@lucide/svelte/icons/sun';
	import UserKeyIcon from '@lucide/svelte/icons/user-key';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ClientAuthState } from '$lib/types/auth';

	interface Props {
		auth: ClientAuthState | null;
		onOpenLogin: () => void;
		onOpenSignup: () => void;
	}

	let { auth, onOpenLogin, onOpenSignup }: Props = $props();
</script>

<div class="flex items-center gap-1.5">
	{#if auth}
		<span class="hidden max-w-36 truncate px-2 text-sm text-muted-foreground md:inline">
			{auth.user.username}
		</span>
		<Button href="/settings" variant="ghost" size="icon" aria-label="Settings">
			<SettingsIcon />
		</Button>
		<form method="POST" action="/logout">
			<Button type="submit" variant="outline">
				<LogOutIcon />
				<span class="hidden sm:inline">Logout</span>
				<span class="sr-only sm:hidden">Logout</span>
			</Button>
		</form>
	{:else}
		<Button variant="ghost" onclick={onOpenLogin}>
			<UserKeyIcon />
			<span class="hidden sm:inline">Login</span>
			<span class="sr-only sm:hidden">Login</span>
		</Button>
		<Button onclick={onOpenSignup}>
			<UserPlusIcon />
			<span class="hidden sm:inline">Sign up</span>
			<span class="sr-only sm:hidden">Sign up</span>
		</Button>
	{/if}

	<Button onclick={toggleMode} variant="outline" size="icon">
		<SunIcon
			class="size-[1.2rem] scale-100 rotate-0 transition-all! dark:scale-0 dark:-rotate-90"
		/>
		<MoonIcon
			class="absolute size-[1.2rem] scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0"
		/>
		<span class="sr-only">Toggle theme</span>
	</Button>
</div>
