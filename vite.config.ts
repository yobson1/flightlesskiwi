import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import pkg from './package.json' with { type: 'json' };
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Keep @sveltejs/kit in dependencies until svelte-adapter-bun supports SvelteKit 3. The adapter
// only externalizes dependencies, and otherwise bundles Kit's browser redirect implementation.
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: vitePreprocess(),
			adapter: adapter(),
			version: { name: pkg.version }
		}),
		Icons({ compiler: 'svelte' })
	]
});
