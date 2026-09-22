const fs = require('fs');
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Prints errors as `file:line:col: error: message` for the tasks.json problem matcher.
// Start/finish are logged once for all bundles, so the task only ends when every build is done.
let running = 0;
const problemMatcherPlugin = {
	name: 'problem-matcher',
	setup(build) {
		build.onStart(() => {
			if (running++ === 0) {
				console.log('[watch] build started');
			}
		});
		build.onEnd(result => {
			const messages = [
				...result.errors.map(message => ({ ...message, severity: 'error' })),
				...result.warnings.map(message => ({ ...message, severity: 'warning' })),
			];
			for (const { text, location, severity } of messages) {
				const where = location ? `${location.file}:${location.line}:${location.column}: ` : '';
				console.error(`${where}${severity}: ${text}`);
			}
			if (--running === 0) {
				console.log('[watch] build finished');
			}
		});
	},
};

const shared = {
	bundle: true,
	minify: production,
	sourcemap: !production,
	logLevel: 'silent',
	plugins: [problemMatcherPlugin],
};

async function main() {
	fs.rmSync('out', { recursive: true, force: true });
	const contexts = await Promise.all([
		esbuild.context({
			...shared,
			entryPoints: ['src/extension.ts'],
			outfile: 'out/extension.js',
			platform: 'node',
			format: 'cjs',
			target: 'node16',
			external: ['vscode'],
		}),
		esbuild.context({
			...shared,
			entryPoints: ['src/page/gallery.ts'],
			outfile: 'out/page/gallery.js',
			platform: 'browser',
			format: 'iife',
			target: 'es2020',
		}),
	]);
	if (watch) {
		await Promise.all(contexts.map(ctx => ctx.watch()));
		return;
	}
	const results = await Promise.all(contexts.map(ctx => ctx.rebuild()));
	await Promise.all(contexts.map(ctx => ctx.dispose()));
	if (results.some(result => result.errors.length)) {
		process.exit(1);
	}
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
