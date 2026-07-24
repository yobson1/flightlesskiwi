export const MAX_BENCHMARK_TITLE_LENGTH = 120;
export const MAX_BENCHMARK_DESCRIPTION_LENGTH = 2_000;
export const MAX_BENCHMARK_FILES = 8;
export const MAX_BENCHMARK_FILE_NAME_LENGTH = 255;
export const MAX_BENCHMARK_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_BENCHMARK_TOTAL_SIZE = 100 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${formatUnit(bytes / 1024)} KiB`;
	return `${formatUnit(bytes / (1024 * 1024))} MiB`;
}

function formatUnit(value: number): string {
	return (value < 10 ? value.toFixed(1) : value.toFixed(0)).replace(/\.0$/, '');
}
