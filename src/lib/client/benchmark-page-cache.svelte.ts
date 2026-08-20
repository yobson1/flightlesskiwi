import type { BenchmarkPageResponse } from '#lib/types/benchmark-api.js';
import { SvelteMap } from 'svelte/reactivity';

export type BenchmarkListing = Omit<BenchmarkPageResponse['benchmarks'][number], 'createdAt'> & {
	createdAt: Date;
};

export type BenchmarkPagination = NonNullable<BenchmarkPageResponse['pagination']>;

export interface LoadedBenchmarkPage {
	benchmarks: BenchmarkListing[];
	pagination: BenchmarkPagination;
}

type PageFetcher = (page: number, signal: AbortSignal) => Promise<LoadedBenchmarkPage>;

export function normalizeBenchmarkPage(response: BenchmarkPageResponse): LoadedBenchmarkPage {
	if (response.pagination === null) throw new Error('Missing benchmark pagination metadata');
	return {
		benchmarks: response.benchmarks.map((benchmark) => ({
			...benchmark,
			createdAt: new Date(benchmark.createdAt)
		})),
		pagination: response.pagination
	};
}

export class BenchmarkPageCache {
	indices: number[] = [];
	benchmarks = new SvelteMap<number, BenchmarkListing>();
	pagination: BenchmarkPagination = {
		page: 1,
		pageSize: 1,
		totalCount: 0,
		totalPages: 1
	};

	#abortController = new AbortController();
	#fetchPage: PageFetcher;
	#generation = 0;
	#inFlight = new Map<number, Promise<void>>();
	#loadedPages = new Set<number>();

	constructor(initialPage: LoadedBenchmarkPage, fetchPage: PageFetcher) {
		this.#fetchPage = fetchPage;
		this.reset(initialPage, fetchPage);
	}

	reset(initialPage: LoadedBenchmarkPage, fetchPage: PageFetcher) {
		this.#generation += 1;
		this.#abortController.abort();
		this.#abortController = new AbortController();
		this.#fetchPage = fetchPage;
		this.#inFlight.clear();
		this.#loadedPages.clear();
		this.benchmarks.clear();
		this.pagination = initialPage.pagination;
		this.indices = Array.from({ length: initialPage.pagination.totalCount }, (_, index) => index);
		this.#mergePage(initialPage);
	}

	destroy() {
		this.#abortController.abort();
		this.#inFlight.clear();
	}

	isLoaded(page: number) {
		return this.#loadedPages.has(page);
	}

	async loadPage(page: number): Promise<void> {
		const targetPage = this.#clampPage(page);
		if (this.#loadedPages.has(targetPage)) return;
		const existingRequest = this.#inFlight.get(targetPage);
		if (existingRequest) return existingRequest;

		const generation = this.#generation;
		const request = this.#fetchPage(targetPage, this.#abortController.signal)
			.then((loadedPage) => {
				if (generation !== this.#generation || this.#abortController.signal.aborted) return;
				this.#mergePage(loadedPage);
			})
			.finally(() => {
				if (generation === this.#generation) this.#inFlight.delete(targetPage);
			});
		this.#inFlight.set(targetPage, request);
		return request;
	}

	async loadPageWindow(page: number): Promise<void> {
		const targetPage = this.#clampPage(page);
		const targetRequest = this.loadPage(targetPage);
		for (const adjacentPage of [targetPage - 1, targetPage + 1]) {
			if (adjacentPage < 1 || adjacentPage > this.pagination.totalPages) continue;
			void this.loadPage(adjacentPage).catch(() => undefined);
		}
		await targetRequest;
	}

	#clampPage(page: number) {
		return Math.max(1, Math.min(Math.trunc(page), this.pagination.totalPages));
	}

	#mergePage(page: LoadedBenchmarkPage) {
		if (
			page.pagination.totalCount !== this.pagination.totalCount ||
			page.pagination.pageSize !== this.pagination.pageSize
		) {
			this.benchmarks.clear();
			this.#loadedPages.clear();
			this.pagination = page.pagination;
			this.indices = Array.from({ length: page.pagination.totalCount }, (_, index) => index);
		} else {
			this.pagination = page.pagination;
		}

		const startIndex = (page.pagination.page - 1) * page.pagination.pageSize;
		page.benchmarks.forEach((benchmark, index) => {
			this.benchmarks.set(startIndex + index, benchmark);
		});
		this.#loadedPages.add(page.pagination.page);
	}
}
