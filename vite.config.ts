import adapter from '@eslym/sveltekit-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import pkg from './package.json' with { type: 'json' };
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: vitePreprocess(),
			adapter: adapter({
				bundler: 'bun',
				bunBuildMinify: true,
				precompress: true
			}),
			output: { linkHeaderPreload: true },
			version: { name: pkg.version }
		}),
		Icons({ compiler: 'svelte' })
	]
});
