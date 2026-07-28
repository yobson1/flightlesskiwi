import { getRequiredEnvironmentVariable } from '$lib/server/env';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

const DATABASE_URL = getRequiredEnvironmentVariable('DATABASE_URL', ':memory:');

export const db = drizzle(DATABASE_URL, { schema });

db.$client.run('PRAGMA journal_mode = WAL');
db.$client.run('PRAGMA synchronous = NORMAL');
db.$client.run('PRAGMA busy_timeout = 5000');
db.$client.run('PRAGMA foreign_keys = ON');
