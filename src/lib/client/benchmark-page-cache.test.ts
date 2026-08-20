import { describe, expect, test } from 'bun:test';
import {
	BenchmarkPageCache,
	type BenchmarkListing,
	type LoadedBenchmarkPage
} from './benchmark-page-cache.svelte';

const PAGE_SIZE = 30;

describe('BenchmarkPageCache', () => {
	test('loads only the target page and one neighbour either side', async () => {
		const requestedPages: number[] = [];
		const cache = new BenchmarkPageCache(createPage(3, 60), async (page) => {
			requestedPages.push(page);
			return createPage(page, 60);
		});

		await cache.loadPageWindow(50);
		await Promise.resolve();
		expect(requestedPages.toSorted((left, right) => left - right)).toEqual([49, 50, 51]);
		expect(cache.benchmarks.get((50 - 1) * PAGE_SIZE)?.id).toBe('page-50-item-0');

		await cache.loadPageWindow(50);
		expect(requestedPages.toSorted((left, right) => left - right)).toEqual([49, 50, 51]);
		cache.destroy();
	});

	test('deduplicates concurrent requests and respects page boundaries', async () => {
		const requestedPages: number[] = [];
		const cache = new BenchmarkPageCache(createPage(1, 2), async (page) => {
			requestedPages.push(page);
			await Promise.resolve();
			return createPage(page, 2);
		});

		await Promise.all([cache.loadPageWindow(2), cache.loadPageWindow(2)]);
		expect(requestedPages).toEqual([2]);
		cache.destroy();
	});

	test('leaves failed pages retryable', async () => {
		let attempts = 0;
		const cache = new BenchmarkPageCache(createPage(1, 3), async (page) => {
			if (page === 2 && attempts++ === 0) throw new Error('temporary failure');
			return createPage(page, 3);
		});

		await expect(cache.loadPage(2)).rejects.toThrow('temporary failure');
		await cache.loadPage(2);
		expect(cache.isLoaded(2)).toBe(true);
		cache.destroy();
	});
});

function createPage(page: number, totalPages: number): LoadedBenchmarkPage {
	const totalCount = totalPages * PAGE_SIZE;
	return {
		benchmarks: Array.from({ length: PAGE_SIZE }, (_, index) => createBenchmark(page, index)),
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			totalCount,
			totalPages
		}
	};
}

function createBenchmark(page: number, index: number): BenchmarkListing {
	return {
		id: `page-${page}-item-${index}`,
		title: `Page ${page} item ${index}`,
		createdAt: new Date('2026-01-01T00:00:00Z'),
		username: 'tester',
		gameName: 'Test game',
		coverImgId: null,
		cpus: [],
		gpus: []
	};
}
