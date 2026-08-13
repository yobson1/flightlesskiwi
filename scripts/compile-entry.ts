import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const clientDirectory = join(import.meta.dir, 'client');

if (!existsSync(clientDirectory)) {
	throw new Error(`Compiled client assets are missing from ${clientDirectory}`);
}

await import('../build/index.js');
