import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	MAX_BENCHMARK_DESCRIPTION_LENGTH,
	MAX_BENCHMARK_FILES,
	MAX_BENCHMARK_FILE_NAME_LENGTH,
	MAX_BENCHMARK_FILE_SIZE,
	MAX_BENCHMARK_TITLE_LENGTH,
	MAX_BENCHMARK_TOTAL_SIZE,
	formatFileSize
} from '$lib/benchmark';
import { error as logError, warn } from '$lib/logger';
import { requireVerifiedPage, requireVerifiedSession } from '$lib/server/auth/api';
import { generateSecureRandomString } from '$lib/server/auth/utils';
import { deleteBenchmarkFiles, writeBenchmarkFiles } from '$lib/server/benchmark-files';
import { flushBenchmarkSearchQueue, queueBenchmarksForSearch } from '$lib/server/benchmark-search';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, game } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

interface SubmittedValues {
	gameId: number | null;
	title: string;
	description: string;
}

export const load: PageServerLoad = (event) => {
	event.setHeaders({ 'cache-control': 'no-store' });
	requireVerifiedPage(event);
};

export const actions: Actions = {
	default: async (event) => {
		const authResult = requireVerifiedSession(event);
		if (authResult.response) {
			const responseData = (await authResult.response.json()) as { message?: string };
			return fail(authResult.response.status, {
				message: responseData.message ?? 'Sign in to upload a benchmark'
			});
		}

		const formData = await event.request.formData();
		const values = parseValues(formData);
		const validationMessage = validateValues(values);
		if (validationMessage) return fail(400, { message: validationMessage, values });

		const rawFiles = formData.getAll('files');
		if (!rawFiles.every((value) => value instanceof File)) {
			return fail(400, { message: 'Select valid benchmark files', values });
		}
		const files = rawFiles as File[];
		const fileValidationMessage = validateFiles(files);
		if (fileValidationMessage) {
			return fail(400, { message: fileValidationMessage, values });
		}

		const selectedGame = db
			.select({ id: game.id })
			.from(game)
			.where(eq(game.id, values.gameId!))
			.get();
		if (!selectedGame) {
			return fail(400, { message: 'Select a game from the search results', values });
		}

		const benchmarkId = generateSecureRandomString();
		const fileRows = files.map((file) => ({
			id: generateSecureRandomString(),
			benchmarkId,
			originalName: safeOriginalName(file.name),
			size: file.size,
			file
		}));
		let filesWritten = false;

		try {
			await writeBenchmarkFiles(fileRows);
			filesWritten = true;

			db.transaction((tx) => {
				tx.insert(benchmarkResult)
					.values({
						id: benchmarkId,
						userId: authResult.authenticated.user.id,
						gameId: values.gameId!,
						title: values.title,
						description: values.description || null,
						createdAt: new Date()
					})
					.run();
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
				queueBenchmarksForSearch([benchmarkId], tx);
			});
		} catch (cause) {
			logError(`Failed to create benchmark ${benchmarkId}`, cause);
			if (filesWritten) {
				try {
					await deleteBenchmarkFiles(fileRows.map(({ id }) => id));
				} catch (cleanupCause) {
					logError(`Failed to clean up files for benchmark ${benchmarkId}`, cleanupCause);
				}
			}
			return fail(500, {
				message: 'The benchmark could not be uploaded. Please try again.',
				values
			});
		}

		try {
			await flushBenchmarkSearchQueue();
		} catch (cause) {
			warn(`Failed to index benchmark ${benchmarkId}; it will be retried on restart`, cause);
		}

		return {
			message: 'Benchmark uploaded',
			benchmarkId
		};
	}
};

function parseValues(formData: FormData): SubmittedValues {
	const rawGameId = formData.get('game_id');
	const gameId =
		typeof rawGameId === 'string' && rawGameId.trim() !== '' ? Number(rawGameId) : null;
	const rawTitle = formData.get('title');
	const rawDescription = formData.get('description');

	return {
		gameId: Number.isSafeInteger(gameId) && gameId! > 0 ? gameId : null,
		title: typeof rawTitle === 'string' ? rawTitle.trim() : '',
		description: typeof rawDescription === 'string' ? rawDescription.trim() : ''
	};
}

function validateValues(values: SubmittedValues): string | null {
	if (values.gameId === null) return 'Select a game from the search results';
	if (!values.title) return 'Enter a title';
	if (values.title.length > MAX_BENCHMARK_TITLE_LENGTH) {
		return `Title must be ${MAX_BENCHMARK_TITLE_LENGTH} characters or fewer`;
	}
	if (values.description.length > MAX_BENCHMARK_DESCRIPTION_LENGTH) {
		return `Description must be ${MAX_BENCHMARK_DESCRIPTION_LENGTH.toLocaleString()} characters or fewer`;
	}
	return null;
}

function validateFiles(files: File[]): string | null {
	if (files.length === 0 || files.every((file) => file.size === 0 && file.name === '')) {
		return 'Select at least one MangoHud or CapFrameX file';
	}
	if (files.length > MAX_BENCHMARK_FILES) {
		return `Select no more than ${MAX_BENCHMARK_FILES} files`;
	}

	let totalSize = 0;
	for (const file of files) {
		const originalName = safeOriginalName(file.name);
		if (!originalName || originalName.length > MAX_BENCHMARK_FILE_NAME_LENGTH) {
			return `Each file name must be between 1 and ${MAX_BENCHMARK_FILE_NAME_LENGTH} characters`;
		}
		if (file.size === 0) return `${originalName} is empty`;
		if (file.size > MAX_BENCHMARK_FILE_SIZE) {
			return `${originalName} exceeds the ${formatFileSize(MAX_BENCHMARK_FILE_SIZE)} per-file limit`;
		}
		totalSize += file.size;
	}

	if (totalSize > MAX_BENCHMARK_TOTAL_SIZE) {
		return `Files exceed the ${formatFileSize(MAX_BENCHMARK_TOTAL_SIZE)} total limit`;
	}
	return null;
}

function safeOriginalName(fileName: string): string {
	return fileName.split(/[/\\]/).at(-1)?.trim() ?? '';
}
