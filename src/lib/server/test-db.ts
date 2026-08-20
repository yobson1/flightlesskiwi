import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import * as schema from '#lib/server/db/schema.js';

let schemaStatements: Promise<string[]> | undefined;

export async function createTestDatabase() {
	const sqlite = new Database(':memory:');
	sqlite.run('PRAGMA foreign_keys = ON');

	for (const statement of await getSchemaStatements()) {
		sqlite.run(statement);
	}

	return {
		db: drizzle(sqlite, { schema }),
		close: () => sqlite.close()
	};
}

function getSchemaStatements(): Promise<string[]> {
	schemaStatements ??= generateSchemaStatements();
	return schemaStatements;
}

async function generateSchemaStatements(): Promise<string[]> {
	const emptySchema = await generateSQLiteDrizzleJson({});
	const currentSchema = await generateSQLiteDrizzleJson(schema);
	return generateSQLiteMigration(emptySchema, currentSchema);
}
