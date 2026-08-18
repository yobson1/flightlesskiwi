import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { error as logError, warn } from '$lib/logger';
import { getClientIP, requireVerifiedPage, requireVerifiedSession } from '$lib/server/auth/api';
import { generateSecureRandomString } from '$lib/server/auth/utils';
import { deleteBenchmarkFiles, writeBenchmarkFiles } from '$lib/server/benchmark-files';
import { flushBenchmarkSearchQueue, queueBenchmarksForSearch } from '$lib/server/benchmark-search';
import {
	createBenchmarkFileRows,
	parseBenchmarkFiles,
	parseBenchmarkValues,
	validateAndParseBenchmarkFiles,
	validateBenchmarkFiles,
	validateBenchmarkValues
} from '$lib/server/benchmark-submission';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, game } from '$lib/server/db/schema';
import { verifyTurnstileToken } from '$lib/server/turnstile';
import { TURNSTILE_RESPONSE_FIELD } from '$lib/turnstile';
import { getMessage } from '$lib/utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	event.setHeaders({ 'cache-control': 'no-store' });
	requireVerifiedPage(event);
};

export const actions: Actions = {
	default: async (event) => {
		const authResult = requireVerifiedSession(event);
		if (authResult.response) {
			return fail(authResult.response.status, {
				message: getMessage(await authResult.response.json(), 'Sign in to upload a benchmark')
			});
		}

		const formData = await event.request.formData();
		const values = parseBenchmarkValues(formData);
		if (
			!(await verifyTurnstileToken(
				formData.get(TURNSTILE_RESPONSE_FIELD),
				getClientIP(event),
				event.fetch
			))
		) {
			return fail(403, { message: 'Complete the verification challenge', values });
		}
		const validationMessage = validateBenchmarkValues(values);
		if (validationMessage) return fail(400, { message: validationMessage, values });

		const files = parseBenchmarkFiles(formData);
		if (files === null) {
			return fail(400, { message: 'Select valid benchmark files', values });
		}
		const fileValidationMessage = validateBenchmarkFiles(files);
		if (fileValidationMessage) return fail(400, { message: fileValidationMessage, values });

		const selectedGame = db
			.select({ id: game.id })
			.from(game)
			.where(eq(game.id, values.gameId!))
			.get();
		if (!selectedGame) {
			return fail(400, { message: 'Select a game from the search results', values });
		}

		const benchmarkId = generateSecureRandomString();
		const fileRows = createBenchmarkFileRows(benchmarkId, files);
		const contentValidationMessage = await validateAndParseBenchmarkFiles(fileRows);
		if (contentValidationMessage) {
			try {
				await deleteBenchmarkFiles(fileRows.map(({ id }) => id));
			} catch (cause) {
				logError(`Failed to clean up parsed files for rejected benchmark ${benchmarkId}`, cause);
			}
			return fail(400, { message: contentValidationMessage, values });
		}
		try {
			await writeBenchmarkFiles(fileRows);

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
						fileRows.map(({ id, benchmarkId: fileBenchmarkId, originalName, size }) => ({
							id,
							benchmarkId: fileBenchmarkId,
							originalName,
							size
						}))
					)
					.run();
				queueBenchmarksForSearch([benchmarkId], tx);
			});
		} catch (cause) {
			logError(`Failed to create benchmark ${benchmarkId}`, cause);
			try {
				await deleteBenchmarkFiles(fileRows.map(({ id }) => id));
			} catch (cleanupCause) {
				logError(`Failed to clean up files for benchmark ${benchmarkId}`, cleanupCause);
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
