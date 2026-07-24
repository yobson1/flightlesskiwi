export const MAX_BENCHMARK_TITLE_LENGTH = 120;
export const MAX_BENCHMARK_DESCRIPTION_LENGTH = 2_000;
export const MAX_BENCHMARK_FILES = 8;
export const MAX_BENCHMARK_FILE_NAME_LENGTH = 255;
export const MAX_BENCHMARK_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_BENCHMARK_TOTAL_SIZE = 100 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
	const mebibytes = bytes / (1024 * 1024);
	return `${mebibytes.toLocaleString(undefined, { maximumFractionDigits: 0 })} MiB`;
}
