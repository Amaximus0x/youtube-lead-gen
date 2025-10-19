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
			regions: ['iad1'],
			maxDuration: 60,
			memory: 1024
		})
	}
};

export default config;
