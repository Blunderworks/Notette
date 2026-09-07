import { defineConfig, type Plugin } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Standalone widget build.
 *
 * Produces a single self-contained IIFE bundle (.widget-dist/notette.js) with all
 * component CSS inlined as a string so the widget can inject it into its own
 * Shadow DOM instead of the host document. The bundle is served by the SvelteKit
 * route at /notette.js, which imports it as raw text.
 */
function inlineCss(): Plugin {
	return {
		name: 'notette-inline-css',
		enforce: 'post',
		generateBundle(_options, bundle) {
			let css = '';
			for (const [fileName, output] of Object.entries(bundle)) {
				if (output.type === 'asset' && fileName.endsWith('.css')) {
					css += String(output.source);
					delete bundle[fileName];
				}
			}
			for (const output of Object.values(bundle)) {
				if (output.type === 'chunk' && output.isEntry) {
					const literal = JSON.stringify(css);
					output.code = output.code
						.split('"__NOTETTE_CSS__"')
						.join(literal)
						.split("'__NOTETTE_CSS__'")
						.join(literal);
				}
			}
		}
	};
}

export default defineConfig({
	plugins: [
		svelte({
			configFile: false,
			preprocess: vitePreprocess(),
			emitCss: true,
			compilerOptions: { runes: true, css: 'external' }
		}),
		inlineCss()
	],
	resolve: {
		alias: {
			$lib: path.resolve(root, 'src/lib')
		}
	},
	define: {
		'process.env.NODE_ENV': JSON.stringify('production')
	},
	build: {
		outDir: '.widget-dist',
		emptyOutDir: true,
		target: 'es2019',
		minify: true,
		sourcemap: false,
		cssCodeSplit: false,
		cssMinify: true,
		lib: {
			entry: path.resolve(root, 'src/widget/index.ts'),
			name: 'Notette',
			formats: ['iife'],
			fileName: () => 'notette.js'
		},
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
				assetFileNames: 'notette.[ext]'
			}
		}
	}
});
