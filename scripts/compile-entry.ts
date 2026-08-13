import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { migrateDatabase } from './migrate';

const clientDirectory = join(import.meta.dir, 'client');
const migrationsDirectory = join(import.meta.dir, 'drizzle');

if (!existsSync(clientDirectory)) {
	throw new Error(`Compiled client assets are missing from ${clientDirectory}`);
}

if (!existsSync(migrationsDirectory)) {
	throw new Error(`Compiled database migrations are missing from ${migrationsDirectory}`);
}

migrateDatabase(migrationsDirectory);

if (process.argv[2] !== 'migrate') {
	await import('../build/index.js');
}
