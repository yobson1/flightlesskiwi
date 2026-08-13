import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

export function migrateDatabase(migrationsFolder = './drizzle') {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set');
	}

	const sqlite = new Database(databaseUrl, { create: true });

	try {
		sqlite.run('PRAGMA busy_timeout = 5000');
		sqlite.run('PRAGMA foreign_keys = ON');

		migrate(drizzle(sqlite), { migrationsFolder });
		console.log('Database migrations applied');
	} finally {
		sqlite.close();
	}
}

if (import.meta.main) {
	migrateDatabase();
}
