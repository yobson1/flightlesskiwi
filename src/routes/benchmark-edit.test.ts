import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import * as schema from '$lib/server/db/schema';
import { createTestDatabase } from '$lib/server/test-db';
import { TEST_PRIVATE_ENV } from '$lib/server/test-env';
import { TURNSTILE_ACTION } from '$lib/turnstile';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;
const deletedFileBatches: string[][] = [];
const writtenFileBatches: Array<Array<{ id: string; originalName: string; size: number }>> = [];
const queuedBenchmarkIds: string[][] = [];
let flushCount = 0;
let turnstileValid = true;
let failWrites = false;
let failQueue = false;

mock.module('$app/env', () => ({ building: false, dev: true }));
mock.module('$app/env/private', () => TEST_PRIVATE_ENV);
mock.module('$lib/server/db', () => ({ db: testDb }));
mock.module('$lib/server/auth/encryption', () => ({
	encrypt: (value: Uint8Array) => Buffer.from(value),
	encryptString: (value: string) => Buffer.from(value),
	decrypt: (value: Uint8Array) => Buffer.from(value),
	decryptToString: (value: Uint8Array) => Buffer.from(value).toString(),
	hashAuthCode: (value: string) => Buffer.from(value)
}));
mock.module('$lib/server/benchmark-run', () => ({
	parseBenchmarkRun: async ({ contents }: { contents?: string }) =>
		contents?.startsWith('valid') ? { source: 'mangohud' } : null
}));
mock.module('$lib/server/benchmark-files', () => ({
	deleteBenchmarkFiles: async (fileIds: string[]) => {
		deletedFileBatches.push([...fileIds]);
	},
	writeBenchmarkFiles: async (files: Array<{ id: string; originalName: string; size: number }>) => {
		writtenFileBatches.push(
			files.map(({ id, originalName, size }) => ({ id, originalName, size }))
		);
		if (failWrites) throw new Error('write failed');
	}
}));
mock.module('$lib/server/benchmark-search', () => ({
	flushBenchmarkSearchQueue: async () => {
		flushCount++;
	},
	queueBenchmarksForSearch: (benchmarkIds: string[]) => {
		if (failQueue) throw new Error('queue failed');
		queuedBenchmarkIds.push([...benchmarkIds]);
	}
}));
const { load, actions } = await import('./benchmark/[id]/edit/+page.server');

beforeEach(() => {
	testDb.delete(schema.benchmarkResult).run();
	testDb.delete(schema.game).run();
	testDb.delete(schema.user).run();
	insertUser('owner');
	insertUser('other');
	insertGame(1);
	insertGame(2);
	deletedFileBatches.length = 0;
	writtenFileBatches.length = 0;
	queuedBenchmarkIds.length = 0;
	flushCount = 0;
	turnstileValid = true;
	failWrites = false;
	failQueue = false;
});

afterAll(() => {
	testDatabase.close();
});

describe('benchmark edit load', () => {
	test('requires a verified owner and returns the populated benchmark', async () => {
		insertBenchmark('benchmark', 'owner', [
			{ id: 'bbbbbbbb', originalName: 'second.csv', size: 20 },
			{ id: 'aaaaaaaa', originalName: 'first.csv', size: 10 }
		]);

		await expectRedirect(() => load!(createLoadEvent('benchmark', null)), '/#login');
		await expectRedirect(
			() => load!(createLoadEvent('benchmark', authenticatedLocals('owner', false))),
			'/#verify-email'
		);
		await expectHttpError(
			() => load!(createLoadEvent('benchmark', authenticatedLocals('other'))),
			403
		);
		await expectHttpError(
			() => load!(createLoadEvent('missing', authenticatedLocals('owner'))),
			404
		);

		const result = await load!(createLoadEvent('benchmark', authenticatedLocals('owner')));
		expect(result).toEqual({
			benchmark: {
				id: 'benchmark',
				gameId: 1,
				title: 'Original title',
				description: 'Original description'
			},
			files: [
				{ id: 'aaaaaaaa', originalName: 'first.csv', size: 10 },
				{ id: 'bbbbbbbb', originalName: 'second.csv', size: 20 }
			]
		});
	});
});

describe('benchmark edit action', () => {
	test('rejects unauthenticated, unverified, non-owner, and missing benchmarks', async () => {
		insertBenchmark('benchmark', 'owner', [{ id: 'aaaaaaaa', originalName: 'run.csv', size: 10 }]);
		const form = validForm();

		expect(await actions.default!(createActionEvent('benchmark', null, form))).toMatchObject({
			status: 401
		});
		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('owner', false), validForm())
			)
		).toMatchObject({ status: 403 });
		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('other'), validForm())
			)
		).toMatchObject({
			status: 403,
			data: { message: 'You can only edit your own benchmarks' }
		});
		expect(
			await actions.default!(
				createActionEvent('missing', authenticatedLocals('owner'), validForm())
			)
		).toMatchObject({ status: 404, data: { message: 'Benchmark not found' } });
	});

	test('updates metadata while retaining existing uploads', async () => {
		insertBenchmark('benchmark', 'owner', [{ id: 'aaaaaaaa', originalName: 'run.csv', size: 10 }]);
		const form = validForm({
			gameId: 2,
			title: '  Updated title  ',
			description: '  Updated notes  '
		});
		// Bun represents an untouched multipart file input as a File with an undefined name.
		form.append('files', new File([], undefined as never));

		await expectRedirect(
			() => actions.default!(createActionEvent('benchmark', authenticatedLocals('owner'), form)),
			'/benchmark/benchmark'
		);

		expect(testDb.select().from(schema.benchmarkResult).get()).toMatchObject({
			id: 'benchmark',
			gameId: 2,
			title: 'Updated title',
			description: 'Updated notes'
		});
		expect(testDb.select().from(schema.benchmarkFile).all()).toEqual([
			expect.objectContaining({ id: 'aaaaaaaa', benchmarkId: 'benchmark' })
		]);
		expect(writtenFileBatches).toEqual([]);
		expect(deletedFileBatches).toEqual([]);
		expect(queuedBenchmarkIds).toEqual([['benchmark']]);
		expect(flushCount).toBe(1);
	});

	test('replaces a selected existing upload only after submission', async () => {
		insertBenchmark('benchmark', 'owner', [
			{ id: 'aaaaaaaa', originalName: 'old.csv', size: 10 },
			{ id: 'bbbbbbbb', originalName: 'keep.csv', size: 20 }
		]);
		const form = validForm();
		form.append('files', new File([], undefined as never));
		form.append('removed_file_ids', 'aaaaaaaa');
		form.append('files', new File(['valid benchmark contents'], 'replacement.csv'));

		await expectRedirect(
			() => actions.default!(createActionEvent('benchmark', authenticatedLocals('owner'), form)),
			'/benchmark/benchmark'
		);

		const storedFiles = testDb
			.select()
			.from(schema.benchmarkFile)
			.all()
			.toSorted((left, right) => left.originalName.localeCompare(right.originalName));
		expect(storedFiles).toHaveLength(2);
		expect(storedFiles[0]).toMatchObject({ id: 'bbbbbbbb', originalName: 'keep.csv' });
		expect(storedFiles[1]).toMatchObject({ originalName: 'replacement.csv' });
		expect(writtenFileBatches).toHaveLength(1);
		expect(writtenFileBatches[0]?.[0]).toMatchObject({ originalName: 'replacement.csv' });
		expect(deletedFileBatches).toEqual([['aaaaaaaa']]);
	});

	test('rejects foreign removal IDs and preserves staged form state', async () => {
		insertBenchmark('benchmark', 'owner', [{ id: 'aaaaaaaa', originalName: 'run.csv', size: 10 }]);
		insertBenchmark('other-benchmark', 'owner', [
			{ id: 'bbbbbbbb', originalName: 'other.csv', size: 10 }
		]);
		const form = validForm({ title: 'Submitted title' });
		form.append('removed_file_ids', 'bbbbbbbb');

		const result = await actions.default!(
			createActionEvent('benchmark', authenticatedLocals('owner'), form)
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				message: 'Select only files from this benchmark',
				values: { title: 'Submitted title' },
				removedFileIds: ['bbbbbbbb']
			}
		});
		expect(testDb.select().from(schema.benchmarkFile).all()).toHaveLength(2);
		expect(deletedFileBatches).toEqual([]);
	});

	test('requires one final upload and enforces Turnstile', async () => {
		insertBenchmark('benchmark', 'owner', [{ id: 'aaaaaaaa', originalName: 'run.csv', size: 10 }]);
		const removeOnlyForm = validForm({ title: 'Still here' });
		removeOnlyForm.append('removed_file_ids', 'aaaaaaaa');

		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('owner'), removeOnlyForm)
			)
		).toMatchObject({
			status: 400,
			data: {
				message: 'Select at least one MangoHud or CapFrameX file',
				values: { title: 'Still here' },
				removedFileIds: ['aaaaaaaa']
			}
		});

		turnstileValid = false;
		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('owner'), validForm())
			)
		).toMatchObject({
			status: 403,
			data: { message: 'Complete the verification challenge' }
		});
		expect(testDb.select().from(schema.benchmarkFile).all()).toHaveLength(1);
	});

	test('validates the selected game and final combined upload limits', async () => {
		insertBenchmark('benchmark', 'owner', [{ id: 'aaaaaaaa', originalName: 'run.csv', size: 10 }]);
		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('owner'), validForm({ gameId: 999 }))
			)
		).toMatchObject({
			status: 400,
			data: { message: 'Select a game from the search results' }
		});

		testDb.delete(schema.benchmarkResult).run();
		insertBenchmark(
			'benchmark',
			'owner',
			Array.from({ length: 8 }, (_, index) => ({
				id: `file${index}`,
				originalName: `run-${index}.csv`,
				size: 10
			}))
		);
		const tooManyFilesForm = validForm();
		tooManyFilesForm.append('files', new File(['valid benchmark'], 'extra.csv'));
		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('owner'), tooManyFilesForm)
			)
		).toMatchObject({
			status: 400,
			data: { message: 'Select no more than 8 files' }
		});

		testDb.delete(schema.benchmarkResult).run();
		insertBenchmark(
			'benchmark',
			'owner',
			Array.from({ length: 6 }, (_, index) => ({
				id: `large${index}`,
				originalName: `large-${index}.csv`,
				size: 5 * 1024 * 1024
			}))
		);
		const tooLargeForm = validForm();
		tooLargeForm.append(
			'files',
			new File([`valid${'x'.repeat(3 * 1024 * 1024)}`], 'extra-large.csv')
		);
		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('owner'), tooLargeForm)
			)
		).toMatchObject({
			status: 400,
			data: { message: 'Files exceed the 32 MiB total limit' }
		});
		expect(writtenFileBatches).toEqual([]);
	});

	test('rejects unsupported new uploads and cleans their parsed artifacts', async () => {
		insertBenchmark('benchmark', 'owner', [{ id: 'aaaaaaaa', originalName: 'run.csv', size: 10 }]);
		const form = validForm();
		form.append('files', new File(['not a benchmark'], 'invalid.csv'));

		const result = await actions.default!(
			createActionEvent('benchmark', authenticatedLocals('owner'), form)
		);

		expect(result).toMatchObject({
			status: 400,
			data: { message: 'invalid.csv is not a supported MangoHud CSV or CapFrameX JSON benchmark' }
		});
		expect(deletedFileBatches).toHaveLength(1);
		expect(deletedFileBatches[0]).toHaveLength(1);
		expect(writtenFileBatches).toEqual([]);
		expect(testDb.select().from(schema.benchmarkFile).all()).toHaveLength(1);
	});

	test('cleans staged uploads when writing or persistence fails', async () => {
		insertBenchmark('benchmark', 'owner', [{ id: 'aaaaaaaa', originalName: 'run.csv', size: 10 }]);
		const writeFailureForm = validForm();
		writeFailureForm.append('files', new File(['valid benchmark'], 'new.csv'));
		failWrites = true;

		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('owner'), writeFailureForm)
			)
		).toMatchObject({ status: 500 });
		expect(deletedFileBatches).toHaveLength(1);

		deletedFileBatches.length = 0;
		failWrites = false;
		failQueue = true;
		const persistenceFailureForm = validForm();
		persistenceFailureForm.append('files', new File(['valid benchmark'], 'newer.csv'));

		expect(
			await actions.default!(
				createActionEvent('benchmark', authenticatedLocals('owner'), persistenceFailureForm)
			)
		).toMatchObject({ status: 500 });
		expect(deletedFileBatches).toHaveLength(1);
		expect(testDb.select().from(schema.benchmarkFile).all()).toEqual([
			expect.objectContaining({ id: 'aaaaaaaa' })
		]);
	});
});

function validForm(
	overrides: { gameId?: number; title?: string; description?: string } = {}
): FormData {
	const form = new FormData();
	form.set('game_id', String(overrides.gameId ?? 1));
	form.set('title', overrides.title ?? 'Updated title');
	form.set('description', overrides.description ?? 'Updated description');
	form.set('cf-turnstile-response', 'valid-token');
	return form;
}

function createLoadEvent(benchmarkId: string, locals: App.Locals | null) {
	const url = new URL(`https://example.com/benchmark/${benchmarkId}/edit`);
	return asTestEvent<Parameters<NonNullable<typeof load>>[0]>()({
		params: { id: benchmarkId },
		url,
		request: new Request(url),
		locals: locals ?? { session: null, user: null },
		setHeaders: () => {}
	});
}

function createActionEvent(benchmarkId: string, locals: App.Locals | null, form: FormData) {
	const url = new URL(`https://example.com/benchmark/${benchmarkId}/edit`);
	return asTestEvent<Parameters<NonNullable<typeof actions.default>>[0]>()({
		params: { id: benchmarkId },
		url,
		request: new Request(url, { method: 'POST', body: form }),
		locals: locals ?? { session: null, user: null },
		fetch: async () =>
			Response.json({
				success: turnstileValid,
				action: TURNSTILE_ACTION,
				hostname: 'app.example'
			}),
		getClientAddress: () => '127.0.0.1'
	});
}

function authenticatedLocals(userId: string, emailVerified = true): App.Locals {
	const now = new Date();
	return {
		session: {
			id: `${userId}-session`,
			userId,
			createdAt: now,
			lastVerifiedAt: now,
			lastReauthenticatedAt: now,
			expiresAt: new Date(now.getTime() + 60_000)
		},
		user: {
			id: userId,
			email: `${userId}@example.com`,
			username: userId,
			emailVerified,
			hasPassword: true,
			registeredTOTP: false,
			registeredPasskey: false,
			registered2FA: false,
			recoveryCodeConfigured: false,
			oauthProviders: []
		}
	};
}

function insertUser(userId: string) {
	testDb
		.insert(schema.user)
		.values({
			id: userId,
			email: `${userId}@example.com`,
			username: userId,
			emailVerified: true,
			createdAt: new Date()
		})
		.run();
}

function insertGame(gameId: number) {
	testDb.insert(schema.game).values({ id: gameId }).run();
}

function insertBenchmark(
	benchmarkId: string,
	userId: string,
	files: Array<{ id: string; originalName: string; size: number }>
) {
	testDb
		.insert(schema.benchmarkResult)
		.values({
			id: benchmarkId,
			userId,
			gameId: 1,
			title: 'Original title',
			description: 'Original description',
			createdAt: new Date()
		})
		.run();
	if (files.length > 0) {
		testDb
			.insert(schema.benchmarkFile)
			.values(files.map((file) => ({ ...file, benchmarkId })))
			.run();
	}
}

function asTestEvent<Target>() {
	return <Source>(value: Source): Target => {
		// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Partial RequestEvent fixture containing every field exercised by this integration test.
		return value as unknown as Target;
	};
}

interface TestOperation {
	(): ReturnType<NonNullable<typeof load>> | ReturnType<NonNullable<typeof actions.default>>;
}

async function expectRedirect(operation: TestOperation, location: string) {
	try {
		await operation();
	} catch (cause) {
		expect(isRedirect(cause)).toBe(true);
		if (isRedirect(cause)) expect(cause.location).toBe(location);
		return;
	}
	throw new Error('Expected redirect');
}

async function expectHttpError(operation: TestOperation, status: number) {
	try {
		await operation();
	} catch (cause) {
		expect(isHttpError(cause, status)).toBe(true);
		return;
	}
	throw new Error('Expected HTTP error');
}
