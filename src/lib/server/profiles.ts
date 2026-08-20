import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';

export function getPublicProfile(username: string) {
	return (
		db
			.select({ id: user.id, username: user.username })
			.from(user)
			.where(eq(user.username, username))
			.get() ?? null
	);
}
