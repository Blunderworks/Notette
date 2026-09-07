import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		fs: {
			// The compiled widget bundle is imported (as raw text) by the /notette.js route.
			allow: ['.widget-dist']
		}
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
