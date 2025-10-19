import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Using Vercel adapter for deployment
		adapter: adapter({
			runtime: 'nodejs20.x',
			maxDuration: 60,
			memory: 3008, // Maximum memory for better Chromium performance
			isr: {
				expiration: false
			}
		})
	}
};

export default config;
