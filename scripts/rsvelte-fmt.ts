import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const formatterRoot = dirname(require.resolve('@rsvelte/fmt/package.json'));
const formatterBin = require.resolve('@rsvelte/fmt/bin/rsvelte-fmt');
const tailwindSidecar = join(formatterRoot, 'lib', 'tailwind-sort.mjs');
const nodeBin = Bun.which('node');

if (!nodeBin) {
	throw new Error(
		'rsvelte-fmt needs Node.js to sort classes for this custom Tailwind configuration.'
	);
}

const result = Bun.spawnSync([nodeBin, formatterBin, ...process.argv.slice(2)], {
	stdout: 'inherit',
	stderr: 'inherit',
	env: {
		...process.env,
		RSVELTE_FMT_NODE: process.env.RSVELTE_FMT_NODE ?? nodeBin,
		RSVELTE_FMT_TAILWIND_SIDECAR: process.env.RSVELTE_FMT_TAILWIND_SIDECAR ?? tailwindSidecar
	}
});

process.exit(result.exitCode);
