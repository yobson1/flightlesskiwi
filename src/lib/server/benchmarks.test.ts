import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as schema from '$lib/server/db/schema';
import { createTestDatabase } from '$lib/server/test-db';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

mock.module('$lib/server/db', () => ({ db: testDb }));

const {
	PUBLIC_BENCHMARK_PAGE_SIZE,
	getPublicBenchmarksPage,
	parsePublicBenchmarkGameId,
	parsePublicBenchmarkPage
} = await import('./benchmarks');

beforeEach(() => {
	testDb.delete(schema.benchmarkFile).run();
	testDb.delete(schema.benchmarkResult).run();
	testDb.delete(schema.gameName).run();
	testDb.delete(schema.game).run();
	testDb.delete(schema.user).run();

	testDb
		.insert(schema.user)
		.values([
			{
				id: 'user-1',
				email: 'one@example.com',
				username: 'one',
				createdAt: new Date('2026-01-01T00:00:00Z')
			},
			{
				id: 'user-2',
				email: 'two@example.com',
				username: 'two',
				createdAt: new Date('2026-01-01T00:00:00Z')
			}
		])
		.run();
	testDb
		.insert(schema.game)
		.values([{ id: 1 }, { id: 2 }])
		.run();
	testDb
		.insert(schema.gameName)
		.values([
			{ gameId: 1, name: 'First game', isPrimary: true },
			{ gameId: 2, name: 'Second game', isPrimary: true }
		])
		.run();

	const createdAt = new Date('2026-06-01T00:00:00Z');
	testDb
		.insert(schema.benchmarkResult)
		.values(
			Array.from({ length: 65 }, (_, index) => {
				const number = index + 1;
				return {
					id: `benchmark-${number.toString().padStart(3, '0')}`,
					userId: number <= 40 ? 'user-1' : 'user-2',
					gameId: number <= 35 ? 1 : 2,
					title: `Benchmark ${number}`,
					createdAt
				};
			})
		)
		.run();
});

afterAll(() => testDatabase.close());

describe('public benchmark page pagination', () => {
	test('returns a direct deterministic page with total metadata', async () => {
		const result = await getPublicBenchmarksPage({ page: 2 });

		expect(result.pagination).toEqual({
			page: 2,
			pageSize: PUBLIC_BENCHMARK_PAGE_SIZE,
			totalCount: 65,
			totalPages: 3
		});
		expect(result.benchmarks).toHaveLength(30);
		expect(result.benchmarks[0]?.id).toBe('benchmark-035');
		expect(result.benchmarks.at(-1)?.id).toBe('benchmark-006');
	});

	test('counts and slices within game and profile filters', async () => {
		const gamePage = await getPublicBenchmarksPage({ gameId: 1, page: 2 });
		const profilePage = await getPublicBenchmarksPage({ userId: 'user-1', page: 2 });

		expect(gamePage.pagination).toMatchObject({ page: 2, totalCount: 35, totalPages: 2 });
		expect(gamePage.benchmarks.map(({ id }) => id)).toEqual([
			'benchmark-005',
			'benchmark-004',
			'benchmark-003',
			'benchmark-002',
			'benchmark-001'
		]);
		expect(profilePage.pagination).toMatchObject({ page: 2, totalCount: 40, totalPages: 2 });
		expect(profilePage.benchmarks[0]?.id).toBe('benchmark-010');
	});

	test('clamps excessive pages and retains cursor pagination', async () => {
		const finalPage = await getPublicBenchmarksPage({ page: 99 });
		expect(finalPage.pagination?.page).toBe(3);
		expect(finalPage.benchmarks.map(({ id }) => id)).toEqual([
			'benchmark-005',
			'benchmark-004',
			'benchmark-003',
			'benchmark-002',
			'benchmark-001'
		]);

		const firstPage = await getPublicBenchmarksPage({ page: 1 });
		expect(firstPage.nextCursor).not.toBeNull();
		const cursorPage = await getPublicBenchmarksPage({ cursor: firstPage.nextCursor! });
		expect(cursorPage.pagination).toBeNull();
		expect(cursorPage.benchmarks[0]?.id).toBe('benchmark-035');
	});
});

describe('benchmark page query parsing', () => {
	test('accepts positive integers and rejects invalid values', () => {
		expect(parsePublicBenchmarkPage(new URLSearchParams())).toBeUndefined();
		expect(parsePublicBenchmarkPage(new URLSearchParams('page=50'))).toBe(50);
		expect(parsePublicBenchmarkPage(new URLSearchParams('page=0'))).toBe(false);
		expect(parsePublicBenchmarkPage(new URLSearchParams('page=1.5'))).toBe(false);
		expect(parsePublicBenchmarkGameId(new URLSearchParams('game_id=2'))).toBe(2);
	});
});
