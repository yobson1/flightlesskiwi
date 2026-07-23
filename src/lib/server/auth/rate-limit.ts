import { eq, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authRateLimit } from '$lib/server/db/schema';
import { encodeHashedSecret } from '$lib/server/auth/utils';

export class RefillingTokenBucket<Key> {
	constructor(
		private readonly namespace: string,
		private readonly max: number,
		private readonly refillIntervalSeconds: number
	) {}

	check(key: Key, cost: number): boolean {
		const now = new Date();
		const row = getBucket(this.id(key));
		if (!row || row.expiresAt <= now) {
			return cost <= this.max;
		}
		return refill(row.tokens, row.refilledAt, now, this.max, this.refillIntervalSeconds) >= cost;
	}

	consume(key: Key, cost: number): boolean {
		const id = this.id(key);
		const now = new Date();
		const expiresAt = new Date(now.getTime() + this.refillIntervalSeconds * this.max * 2 * 1000);
		const consumed = db.transaction((tx) => {
			const row = tx.select().from(authRateLimit).where(eq(authRateLimit.id, id)).get();
			const tokens =
				!row || row.expiresAt <= now
					? this.max
					: refill(row.tokens, row.refilledAt, now, this.max, this.refillIntervalSeconds);
			if (tokens < cost) {
				return false;
			}
			tx.insert(authRateLimit)
				.values({
					id,
					tokens: tokens - cost,
					refilledAt: now,
					expiresAt
				})
				.onConflictDoUpdate({
					target: authRateLimit.id,
					set: { tokens: tokens - cost, refilledAt: now, expiresAt }
				})
				.run();
			return true;
		});
		cleanExpiredBuckets();
		return consumed;
	}

	reset(key: Key): void {
		db.delete(authRateLimit)
			.where(eq(authRateLimit.id, this.id(key)))
			.run();
	}

	private id(key: Key): string {
		return encodeHashedSecret(`${this.namespace}:${String(key)}`);
	}
}

export class ExpiringTokenBucket<Key> {
	constructor(
		private readonly namespace: string,
		private readonly max: number,
		private readonly expiresInSeconds: number
	) {}

	check(key: Key, cost: number): boolean {
		const row = getBucket(this.id(key));
		return !row || row.expiresAt <= new Date() || row.tokens >= cost;
	}

	consume(key: Key, cost: number): boolean {
		const id = this.id(key);
		const now = new Date();
		const consumed = db.transaction((tx) => {
			const row = tx.select().from(authRateLimit).where(eq(authRateLimit.id, id)).get();
			const tokens = !row || row.expiresAt <= now ? this.max : row.tokens;
			if (tokens < cost) {
				return false;
			}
			const expiresAt =
				!row || row.expiresAt <= now
					? new Date(now.getTime() + this.expiresInSeconds * 1000)
					: row.expiresAt;
			tx.insert(authRateLimit)
				.values({
					id,
					tokens: tokens - cost,
					refilledAt: now,
					expiresAt
				})
				.onConflictDoUpdate({
					target: authRateLimit.id,
					set: { tokens: tokens - cost, refilledAt: now, expiresAt }
				})
				.run();
			return true;
		});
		cleanExpiredBuckets();
		return consumed;
	}

	reset(key: Key): void {
		db.delete(authRateLimit)
			.where(eq(authRateLimit.id, this.id(key)))
			.run();
	}

	private id(key: Key): string {
		return encodeHashedSecret(`${this.namespace}:${String(key)}`);
	}
}

function getBucket(id: string) {
	return db.select().from(authRateLimit).where(eq(authRateLimit.id, id)).get();
}

function refill(
	tokens: number,
	refilledAt: Date,
	now: Date,
	max: number,
	intervalSeconds: number
): number {
	const refillCount = Math.floor((now.getTime() - refilledAt.getTime()) / (intervalSeconds * 1000));
	return Math.min(tokens + Math.max(0, refillCount), max);
}

function cleanExpiredBuckets(): void {
	if (Math.random() < 0.01) {
		db.delete(authRateLimit).where(lt(authRateLimit.expiresAt, new Date())).run();
	}
}
