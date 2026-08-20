<script lang="ts">
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import SunIcon from '@lucide/svelte/icons/sun';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import UserIcon from '@lucide/svelte/icons/user';
	import UserKeyIcon from '@lucide/svelte/icons/user-key';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { toggleMode } from 'mode-watcher';
	import { refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthModal } from '#lib/auth-modal.js';
	import { authRequest } from '#lib/client/auth-api.js';
	import Blobatar from '#lib/components/blobatar.svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import type { ClientAuthState } from '#lib/types/auth.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		auth: ClientAuthState | null;
	}

	let { auth }: Props = $props();
	const authModal = getAuthModal();

	async function logout() {
		await authRequest('/api/auth/logout', { method: 'POST' });
		await refreshAll();
		await authModal.open('login');
	}
</script>

<div class="flex items-center gap-1.5">
	{#if auth}
		<Button href="/benchmark/new">
			<UploadIcon />
			<span class="hidden sm:inline">Upload benchmark</span>
			<span class="sr-only sm:hidden">Upload benchmark</span>
		</Button>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class={cn(buttonVariants({ variant: 'outline' }), 'gap-2 py-0 pr-2 pl-1')}
				aria-label={`Open user menu for ${auth.user.username}`}
			>
				<Blobatar name={auth.user.username} size={24} alt="" />
				<span class="hidden max-w-36 truncate text-muted-foreground sm:inline">
					{auth.user.username}
				</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={resolve('/profile/[username]', { username: auth.user.username })}>
							<UserIcon />
							Profile
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href="/settings">
							<SettingsIcon />
							Settings
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onSelect={() => void logout()}>
					<LogOutIcon />
					Logout
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else}
		<Button variant="ghost" onclick={() => void authModal.open('login')}>
			<UserKeyIcon />
			<span class="hidden sm:inline">Login</span>
			<span class="sr-only sm:hidden">Login</span>
		</Button>
		<Button onclick={() => void authModal.open('signup')}>
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
