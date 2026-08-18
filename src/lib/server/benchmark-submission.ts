import {
	MAX_BENCHMARK_DESCRIPTION_LENGTH,
	MAX_BENCHMARK_FILES,
	MAX_BENCHMARK_FILE_NAME_LENGTH,
	MAX_BENCHMARK_FILE_SIZE,
	MAX_BENCHMARK_TITLE_LENGTH,
	MAX_BENCHMARK_TOTAL_SIZE,
	formatFileSize
} from '$lib/benchmark';
import { getCapFrameXRunCount } from '$lib/capframex';
import { generateSecureRandomString } from '$lib/server/auth/utils';
import { parseBenchmarkRun } from '$lib/server/benchmark-run';
import * as v from 'valibot';

const submittedValuesSchema = v.object({
	gameId: v.fallback(
		v.nullable(
			v.pipe(
				v.string(),
				v.trim(),
				v.nonEmpty(),
				v.transform(Number),
				v.safeInteger(),
				v.minValue(1)
			)
		),
		null
	),
	title: v.fallback(v.pipe(v.string(), v.trim()), ''),
	description: v.fallback(v.pipe(v.string(), v.trim()), '')
});
const benchmarkFilesSchema = v.array(v.instance(File));

export type BenchmarkSubmittedValues = v.InferOutput<typeof submittedValuesSchema>;

export interface StoredBenchmarkFileSummary {
	id: string;
	originalName: string;
	size: number;
}

export interface NewBenchmarkFileRow extends StoredBenchmarkFileSummary {
	benchmarkId: string;
	file: File;
}

export function parseBenchmarkValues(formData: FormData): BenchmarkSubmittedValues {
	return v.parse(submittedValuesSchema, {
		gameId: formData.get('game_id'),
		title: formData.get('title'),
		description: formData.get('description')
	});
}

export function validateBenchmarkValues(values: BenchmarkSubmittedValues): string | null {
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

export function parseBenchmarkFiles(formData: FormData): File[] | null {
	const result = v.safeParse(benchmarkFilesSchema, formData.getAll('files'));
	if (!result.success) return null;
	return result.output.filter((file) => file.size !== 0 || safeOriginalName(file.name) !== '');
}

export function validateBenchmarkFiles(
	newFiles: File[],
	retainedFiles: Array<Pick<StoredBenchmarkFileSummary, 'size'>> = []
): string | null {
	if (retainedFiles.length + newFiles.length === 0) {
		return 'Select at least one MangoHud or CapFrameX file';
	}
	if (retainedFiles.length + newFiles.length > MAX_BENCHMARK_FILES) {
		return `Select no more than ${MAX_BENCHMARK_FILES} files`;
	}

	let totalSize = retainedFiles.reduce((total, file) => total + file.size, 0);
	for (const file of newFiles) {
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

export function createBenchmarkFileRows(benchmarkId: string, files: File[]): NewBenchmarkFileRow[] {
	return files.map((file) => ({
		id: generateSecureRandomString(),
		benchmarkId,
		originalName: safeOriginalName(file.name),
		size: file.size,
		file
	}));
}

export async function validateAndParseBenchmarkFiles(
	files: Array<Pick<NewBenchmarkFileRow, 'id' | 'originalName' | 'file'>>
): Promise<string | null> {
	for (const file of files) {
		let contents: string;
		try {
			contents = await file.file.text();
		} catch {
			return `${file.originalName} could not be read`;
		}

		const benchmarkRun = await parseBenchmarkRun({
			fileId: file.id,
			contents,
			label: file.originalName
		});
		if (benchmarkRun) continue;
		const capFrameXRunCount = getCapFrameXRunCount(contents);
		if (capFrameXRunCount !== null && capFrameXRunCount !== 1) {
			return `${file.originalName} must contain exactly one CapFrameX run (found ${capFrameXRunCount})`;
		}
		return `${file.originalName} is not a supported MangoHud CSV or CapFrameX JSON benchmark`;
	}
	return null;
}

function safeOriginalName(fileName: unknown): string {
	const result = v.safeParse(v.string(), fileName);
	return result.success ? (result.output.split(/[/\\]/).at(-1)?.trim() ?? '') : '';
}
