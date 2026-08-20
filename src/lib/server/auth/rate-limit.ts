import { eq, lt } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { authRateLimit } from '#lib/server/db/schema.js';
import { encodeHashedSecret } from '#lib/server/auth/utils.js';

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

export class ExpiringMultiWindowTokenBucket<Key> {
	constructor(
		private readonly namespace: string,
		private readonly windows: readonly {
			max: number;
			expiresInSeconds: number;
		}[]
	) {}

	check(key: Key, cost: number): boolean {
		return this.retryAfterSeconds(key, cost) === 0;
	}

	retryAfterSeconds(key: Key, cost: number): number {
		const now = new Date();
		return this.windows.reduce((retryAfter, _, index) => {
			const row = getBucket(this.id(key, index));
			if (!row || row.expiresAt <= now || row.tokens >= cost) {
				return retryAfter;
			}
			return Math.max(retryAfter, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000));
		}, 0);
	}

	consume(key: Key, cost: number): boolean {
		const now = new Date();
		const consumed = db.transaction((tx) => {
			const buckets = this.windows.map((window, index) => {
				const id = this.id(key, index);
				const row = tx.select().from(authRateLimit).where(eq(authRateLimit.id, id)).get();
				const expired = !row || row.expiresAt <= now;
				return {
					id,
					tokens: expired ? window.max : row.tokens,
					expiresAt: expired
						? new Date(now.getTime() + window.expiresInSeconds * 1000)
						: row.expiresAt
				};
			});
			if (buckets.some((bucket) => bucket.tokens < cost)) {
				return false;
			}
			for (const bucket of buckets) {
				tx.insert(authRateLimit)
					.values({
						id: bucket.id,
						tokens: bucket.tokens - cost,
						refilledAt: now,
						expiresAt: bucket.expiresAt
					})
					.onConflictDoUpdate({
						target: authRateLimit.id,
						set: {
							tokens: bucket.tokens - cost,
							refilledAt: now,
							expiresAt: bucket.expiresAt
						}
					})
					.run();
			}
			return true;
		});
		cleanExpiredBuckets();
		return consumed;
	}

	reset(key: Key): void {
		db.transaction((tx) => {
			for (let index = 0; index < this.windows.length; index++) {
				tx.delete(authRateLimit)
					.where(eq(authRateLimit.id, this.id(key, index)))
					.run();
			}
		});
	}

	private id(key: Key, windowIndex: number): string {
		return encodeHashedSecret(`${this.namespace}:${windowIndex}:${String(key)}`);
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
