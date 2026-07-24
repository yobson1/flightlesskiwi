import { env } from '$env/dynamic/private';
import { mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const FILE_ID_PATTERN = /^[a-z2-7]+$/;

function getUploadDirectory(): string {
	return resolve(env.BENCHMARK_UPLOAD_DIR || 'uploads/benchmarks');
}

export function getBenchmarkFilePath(fileId: string): string {
	if (!FILE_ID_PATTERN.test(fileId)) {
		throw new Error('Invalid benchmark file ID');
	}
	return resolve(getUploadDirectory(), fileId);
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
		fileIds.map(async (fileId) => {
			try {
				await unlink(getBenchmarkFilePath(fileId));
			} catch (cause) {
				if (isMissingFileError(cause)) return;
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

function isMissingFileError(cause: unknown): boolean {
	return (
		typeof cause === 'object' &&
		cause !== null &&
		'code' in cause &&
		(cause as { code?: unknown }).code === 'ENOENT'
	);
}
