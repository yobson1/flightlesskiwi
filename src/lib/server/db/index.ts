import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

function createDatabase() {
	const database = drizzle(DATABASE_URL!, { schema });

	database.$client.run('PRAGMA journal_mode = WAL');
	database.$client.run('PRAGMA synchronous = NORMAL');
	database.$client.run('PRAGMA busy_timeout = 5000');
	database.$client.run('PRAGMA foreign_keys = ON');

	return database;
}

// SvelteKit imports server modules while analysing the application during a build.
// The database is initialized normally when the built server starts.
export const db = (building ? undefined : createDatabase()) as ReturnType<typeof createDatabase>;
