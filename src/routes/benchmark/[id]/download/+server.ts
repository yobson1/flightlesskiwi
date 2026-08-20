import { error } from '@sveltejs/kit';
import { createGzip } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { pack } from 'tar-stream';
import { getBenchmarkFilePath } from '#lib/server/benchmark-files.js';
import { db } from '#lib/server/db/index.js';
import { benchmarkFile, benchmarkResult } from '#lib/server/db/schema.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const benchmark = db
		.select({ id: benchmarkResult.id })
		.from(benchmarkResult)
		.where(eq(benchmarkResult.id, params.id))
		.get();
	if (!benchmark) error(404, 'Benchmark not found');

	const files = db
		.select({
			id: benchmarkFile.id,
			originalName: benchmarkFile.originalName
		})
		.from(benchmarkFile)
		.where(eq(benchmarkFile.benchmarkId, benchmark.id))
		.orderBy(benchmarkFile.originalName, benchmarkFile.id)
		.all();
	if (files.length === 0) error(404, 'Benchmark files not found');

	const storedFiles = files.map((file) => ({
		...file,
		contents: Bun.file(getBenchmarkFilePath(file.id))
	}));
	if (!(await allFilesExist(storedFiles.map(({ contents }) => contents)))) {
		error(404, 'One or more benchmark files could not be found');
	}

	const commonHeaders = {
		'cache-control': 'no-store',
		'x-content-type-options': 'nosniff'
	};

	if (storedFiles.length === 1) {
		const { originalName, contents } = storedFiles[0]!;
		return new Response(contents, {
			headers: {
				...commonHeaders,
				'content-type': 'application/octet-stream',
				'content-disposition': contentDisposition(originalName)
			}
		});
	}

	const nameCounts = new Map<string, number>();
	for (const { originalName } of storedFiles) {
		nameCounts.set(originalName, (nameCounts.get(originalName) ?? 0) + 1);
	}

	const entries = await Promise.all(
		storedFiles.map(async ({ originalName, contents }, index) => ({
			name: nameCounts.get(originalName) === 1 ? originalName : `${index + 1}/${originalName}`,
			data: Buffer.from(await contents.arrayBuffer())
		}))
	);
	const archive = pack();
	const compressedArchive = archive.pipe(createGzip());
	for (const entry of entries) {
		archive.entry({ name: entry.name, size: entry.data.length }, entry.data);
	}
	archive.finalize();
	const archiveName = `benchmark-${benchmark.id}.tar.gz`;
	const archiveIterator = compressedArchive[Symbol.asyncIterator]();
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const chunk = await archiveIterator.next();
			if (chunk.done) controller.close();
			else controller.enqueue(chunk.value);
		},
		async cancel() {
			await archiveIterator.return?.();
			compressedArchive.destroy();
		}
	});

	return new Response(body, {
		headers: {
			...commonHeaders,
			'content-type': 'application/gzip',
			'content-disposition': contentDisposition(archiveName)
		}
	});
};

async function allFilesExist(files: Bun.BunFile[]): Promise<boolean> {
	const results = await Promise.all(files.map((file) => file.exists()));
	return results.every(Boolean);
}

function contentDisposition(fileName: string): string {
	const fallback =
		fileName
			.replace(/[^\x20-\x7e]/g, '_')
			.replace(/["\\;]/g, '_')
			.trim() || 'download';
	const encoded = encodeURIComponent(fileName).replace(
		/['()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
