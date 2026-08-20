import { BENCHMARK_UPLOAD_DIR } from '$app/env/private';
import {
	BENCHMARK_PARSER_VERSION,
	deserializeParsedBenchmarkRun,
	getParsedBenchmarkRunVersion,
	serializeParsedBenchmarkRun
} from '#lib/benchmark-run-cache.js';
import type { BenchmarkRun } from '#lib/benchmark-run-model.js';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as v from 'valibot';

const FILE_ID_PATTERN = /^[a-z2-7]+$/;
const missingFileErrorSchema = v.object({ code: v.literal('ENOENT') });

function getUploadDirectory(): string {
	return resolve(BENCHMARK_UPLOAD_DIR);
}

export function getBenchmarkFilePath(fileId: string): string {
	if (!FILE_ID_PATTERN.test(fileId)) {
		throw new Error('Invalid benchmark file ID');
	}
	return resolve(getUploadDirectory(), fileId);
}

function getParsedBenchmarkFilePath(fileId: string): string {
	return `${getBenchmarkFilePath(fileId)}.parsed`;
}

export type ParsedBenchmarkFileResult =
	| {
			status: 'hit';
			benchmarkRun: BenchmarkRun;
	  }
	| {
			status: 'missing';
			benchmarkRun: null;
	  }
	| {
			status: 'invalid';
			benchmarkRun: null;
	  }
	| {
			status: 'stale' | 'newer';
			benchmarkRun: null;
	  };

export async function readParsedBenchmarkFile(fileId: string): Promise<ParsedBenchmarkFileResult> {
	const file = Bun.file(getParsedBenchmarkFilePath(fileId));
	if (!(await file.exists())) {
		return { status: 'missing', benchmarkRun: null };
	}

	const version = getParsedBenchmarkRunVersion(await file.slice(0, 128).text());
	if (version === null) {
		return { status: 'invalid', benchmarkRun: null };
	}
	if (version < BENCHMARK_PARSER_VERSION) {
		return { status: 'stale', benchmarkRun: null };
	}
	if (version > BENCHMARK_PARSER_VERSION) {
		return { status: 'newer', benchmarkRun: null };
	}

	const benchmarkRun = deserializeParsedBenchmarkRun(await file.text());
	return benchmarkRun ? { status: 'hit', benchmarkRun } : { status: 'invalid', benchmarkRun: null };
}

export async function writeParsedBenchmarkFile(
	fileId: string,
	benchmarkRun: BenchmarkRun
): Promise<number> {
	await mkdir(getUploadDirectory(), { recursive: true });
	const parsedFilePath = getParsedBenchmarkFilePath(fileId);
	const temporaryFilePath = `${parsedFilePath}.${randomUUID()}.tmp`;

	try {
		const bytes = await Bun.write(temporaryFilePath, serializeParsedBenchmarkRun(benchmarkRun));
		await rename(temporaryFilePath, parsedFilePath);
		return bytes;
	} catch (cause) {
		try {
			await unlink(temporaryFilePath);
		} catch {
			// Best-effort cleanup; preserve the original cache write failure.
		}
		throw cause;
	}
}

export async function readBenchmarkFilePrefix(
	fileId: string,
	maximumBytes = 64 * 1024
): Promise<string> {
	return Bun.file(getBenchmarkFilePath(fileId)).slice(0, maximumBytes).text();
}

export async function readBenchmarkFile(fileId: string): Promise<string> {
	return Bun.file(getBenchmarkFilePath(fileId)).text();
}

export async function writeBenchmarkFiles(files: Array<{ id: string; file: File }>): Promise<void> {
	await mkdir(getUploadDirectory(), { recursive: true });
	const writtenFileIds: string[] = [];

	try {
		for (const { id, file } of files) {
			writtenFileIds.push(id);
			await Bun.write(getBenchmarkFilePath(id), file);
		}
	} catch (cause) {
		await deleteBenchmarkFiles(writtenFileIds);
		throw cause;
	}
}

export async function deleteBenchmarkFiles(fileIds: string[]): Promise<void> {
	const results = await Promise.allSettled(
		fileIds
			.flatMap((fileId) => [getBenchmarkFilePath(fileId), getParsedBenchmarkFilePath(fileId)])
			.map(async (filePath) => {
				try {
					await unlink(filePath);
				} catch (cause) {
					if (v.is(missingFileErrorSchema, cause)) return;
					throw cause;
				}
			})
	);
	const failures = results
		.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		.map((result) => result.reason);

	if (failures.length > 0) {
		throw new AggregateError(failures, 'Failed to remove one or more benchmark files');
	}
}
