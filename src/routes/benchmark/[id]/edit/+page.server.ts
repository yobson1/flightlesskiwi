import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { error as logError, info, warn } from '#lib/logger.js';
import { getClientIP, requireVerifiedPage, requireVerifiedSession } from '#lib/server/auth/api.js';
import { deleteBenchmarkFiles, writeBenchmarkFiles } from '#lib/server/benchmark-files.js';
import {
	flushBenchmarkSearchQueue,
	queueBenchmarksForSearch
} from '#lib/server/benchmark-search.js';
import {
	createBenchmarkFileRows,
	parseBenchmarkFiles,
	parseBenchmarkValues,
	validateAndParseBenchmarkFiles,
	validateBenchmarkFiles,
	validateBenchmarkValues,
	type BenchmarkSubmittedValues,
	type StoredBenchmarkFileSummary
} from '#lib/server/benchmark-submission.js';
import { db } from '#lib/server/db/index.js';
import { benchmarkFile, benchmarkResult, game } from '#lib/server/db/schema.js';
import { verifyTurnstileToken } from '#lib/server/turnstile.js';
import { TURNSTILE_RESPONSE_FIELD } from '#lib/turnstile.js';
import { getMessage } from '#lib/utils.js';
import type { Actions, PageServerLoad } from './$types';
import * as v from 'valibot';

const removedFileIdsSchema = v.pipe(
	v.array(v.pipe(v.string(), v.trim(), v.nonEmpty())),
	v.check((fileIds) => new Set(fileIds).size === fileIds.length)
);

export const load: PageServerLoad = (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const { user } = requireVerifiedPage(event);
	const benchmark = getBenchmark(event.params.id);
	if (!benchmark) error(404, 'Benchmark not found');
	if (benchmark.userId !== user.id) error(403, 'You can only edit your own benchmarks');

	return {
		benchmark: {
			id: benchmark.id,
			gameId: benchmark.gameId,
			title: benchmark.title,
			description: benchmark.description ?? ''
		},
		files: getBenchmarkFiles(benchmark.id)
	};
};

export const actions: Actions = {
	default: async (event) => {
		const authResult = requireVerifiedSession(event);
		if (authResult.response) {
			return fail(authResult.response.status, {
				message: getMessage(await authResult.response.json(), 'Sign in to edit this benchmark')
			});
		}

		const formData = await event.request.formData();
		const values = parseBenchmarkValues(formData);
		const removedFileIdsResult = v.safeParse(
			removedFileIdsSchema,
			formData.getAll('removed_file_ids')
		);
		if (!removedFileIdsResult.success) {
			return editFailure(400, 'Select valid benchmark files', values, []);
		}
		const removedFileIds = removedFileIdsResult.output;

		const benchmark = getBenchmark(event.params.id);
		if (!benchmark) return editFailure(404, 'Benchmark not found', values, removedFileIds);
		if (benchmark.userId !== authResult.authenticated.user.id) {
			return editFailure(403, 'You can only edit your own benchmarks', values, removedFileIds);
		}

		if (
			!(await verifyTurnstileToken(
				formData.get(TURNSTILE_RESPONSE_FIELD),
				getClientIP(event),
				event.fetch
			))
		) {
			return editFailure(403, 'Complete the verification challenge', values, removedFileIds);
		}

		const validationMessage = validateBenchmarkValues(values);
		if (validationMessage) {
			return editFailure(400, validationMessage, values, removedFileIds);
		}

		const files = parseBenchmarkFiles(formData);
		if (files === null) {
			return editFailure(400, 'Select valid benchmark files', values, removedFileIds);
		}

		const currentFiles = getBenchmarkFiles(benchmark.id);
		const currentFileIds = new Set(currentFiles.map(({ id }) => id));
		if (removedFileIds.some((fileId) => !currentFileIds.has(fileId))) {
			return editFailure(400, 'Select only files from this benchmark', values, removedFileIds);
		}
		const removedFileIdSet = new Set(removedFileIds);
		const retainedFiles = currentFiles.filter((file) => !removedFileIdSet.has(file.id));
		const fileValidationMessage = validateBenchmarkFiles(files, retainedFiles);
		if (fileValidationMessage) {
			return editFailure(400, fileValidationMessage, values, removedFileIds);
		}

		const selectedGame = db
			.select({ id: game.id })
			.from(game)
			.where(eq(game.id, values.gameId!))
			.get();
		if (!selectedGame) {
			return editFailure(400, 'Select a game from the search results', values, removedFileIds);
		}

		const fileRows = createBenchmarkFileRows(benchmark.id, files);
		const contentValidationMessage = await validateAndParseBenchmarkFiles(fileRows);
		if (contentValidationMessage) {
			await cleanUpNewFiles(
				benchmark.id,
				fileRows.map(({ id }) => id)
			);
			return editFailure(400, contentValidationMessage, values, removedFileIds);
		}

		try {
			if (fileRows.length > 0) await writeBenchmarkFiles(fileRows);
		} catch (cause) {
			logError(`Failed to write new files for benchmark ${benchmark.id}`, cause);
			await cleanUpNewFiles(
				benchmark.id,
				fileRows.map(({ id }) => id)
			);
			return editFailure(
				500,
				'The benchmark could not be updated. Please try again.',
				values,
				removedFileIds
			);
		}

		let transactionResult: EditTransactionResult;
		try {
			transactionResult = db.transaction((tx) => {
				const currentBenchmark = tx
					.select({ userId: benchmarkResult.userId })
					.from(benchmarkResult)
					.where(eq(benchmarkResult.id, benchmark.id))
					.get();
				if (!currentBenchmark) return { status: 'not-found' };
				if (currentBenchmark.userId !== authResult.authenticated.user.id) {
					return { status: 'forbidden' };
				}

				const transactionalFiles = tx
					.select({
						id: benchmarkFile.id,
						originalName: benchmarkFile.originalName,
						size: benchmarkFile.size
					})
					.from(benchmarkFile)
					.where(eq(benchmarkFile.benchmarkId, benchmark.id))
					.all();
				const transactionalFileIds = new Set(transactionalFiles.map(({ id }) => id));
				if (removedFileIds.some((fileId) => !transactionalFileIds.has(fileId))) {
					return { status: 'stale-files' };
				}
				const transactionalRetainedFiles = transactionalFiles.filter(
					(file) => !removedFileIdSet.has(file.id)
				);
				const transactionalValidationMessage = validateBenchmarkFiles(
					files,
					transactionalRetainedFiles
				);
				if (transactionalValidationMessage) {
					return { status: 'invalid-files', message: transactionalValidationMessage };
				}

				const updated = tx
					.update(benchmarkResult)
					.set({
						gameId: values.gameId!,
						title: values.title,
						description: values.description || null
					})
					.where(
						and(
							eq(benchmarkResult.id, benchmark.id),
							eq(benchmarkResult.userId, authResult.authenticated.user.id)
						)
					)
					.returning({ id: benchmarkResult.id })
					.get();
				if (!updated) return { status: 'not-found' };

				if (removedFileIds.length > 0) {
					tx.delete(benchmarkFile)
						.where(
							and(
								eq(benchmarkFile.benchmarkId, benchmark.id),
								inArray(benchmarkFile.id, removedFileIds)
							)
						)
						.run();
				}
				if (fileRows.length > 0) {
					tx.insert(benchmarkFile)
						.values(
							fileRows.map(({ id, benchmarkId, originalName, size }) => ({
								id,
								benchmarkId,
								originalName,
								size
							}))
						)
						.run();
				}
				queueBenchmarksForSearch([benchmark.id], tx);
				return { status: 'updated' };
			});
		} catch (cause) {
			logError(`Failed to update benchmark ${benchmark.id}`, cause);
			await cleanUpNewFiles(
				benchmark.id,
				fileRows.map(({ id }) => id)
			);
			return editFailure(
				500,
				'The benchmark could not be updated. Please try again.',
				values,
				removedFileIds
			);
		}

		if (transactionResult.status !== 'updated') {
			await cleanUpNewFiles(
				benchmark.id,
				fileRows.map(({ id }) => id)
			);
			if (transactionResult.status === 'not-found') {
				return editFailure(404, 'Benchmark not found', values, removedFileIds);
			}
			if (transactionResult.status === 'forbidden') {
				return editFailure(403, 'You can only edit your own benchmarks', values, removedFileIds);
			}
			if (transactionResult.status === 'invalid-files') {
				return editFailure(400, transactionResult.message, values, removedFileIds);
			}
			return editFailure(
				409,
				'Benchmark files changed while you were editing. Reload and try again.',
				values,
				removedFileIds
			);
		}
		info(`Edited benchmark ${benchmark.id}`);

		if (removedFileIds.length > 0) {
			try {
				await deleteBenchmarkFiles(removedFileIds);
				info(
					`Deleted ${removedFileIds.length} benchmark ${removedFileIds.length === 1 ? 'upload' : 'uploads'} while editing benchmark ${benchmark.id}`
				);
			} catch (cause) {
				logError(`Failed to clean up removed files for benchmark ${benchmark.id}`, cause);
			}
		}
		try {
			await flushBenchmarkSearchQueue();
		} catch (cause) {
			warn(`Failed to reindex benchmark ${benchmark.id}; it will be retried on restart`, cause);
		}

		redirect(303, `/benchmark/${benchmark.id}`);
	}
};

type EditTransactionResult =
	| { status: 'updated' | 'not-found' | 'forbidden' | 'stale-files' }
	| { status: 'invalid-files'; message: string };

function getBenchmark(benchmarkId: string) {
	return db
		.select({
			id: benchmarkResult.id,
			userId: benchmarkResult.userId,
			gameId: benchmarkResult.gameId,
			title: benchmarkResult.title,
			description: benchmarkResult.description
		})
		.from(benchmarkResult)
		.where(eq(benchmarkResult.id, benchmarkId))
		.get();
}

function getBenchmarkFiles(benchmarkId: string): StoredBenchmarkFileSummary[] {
	return db
		.select({
			id: benchmarkFile.id,
			originalName: benchmarkFile.originalName,
			size: benchmarkFile.size
		})
		.from(benchmarkFile)
		.where(eq(benchmarkFile.benchmarkId, benchmarkId))
		.orderBy(benchmarkFile.originalName)
		.all();
}

function editFailure(
	status: number,
	message: string,
	values: BenchmarkSubmittedValues,
	removedFileIds: string[]
) {
	return fail(status, { message, values, removedFileIds });
}

async function cleanUpNewFiles(benchmarkId: string, fileIds: string[]) {
	if (fileIds.length === 0) return;
	try {
		await deleteBenchmarkFiles(fileIds);
	} catch (cause) {
		logError(`Failed to clean up new files for benchmark ${benchmarkId}`, cause);
	}
}
