import type { ImageSize } from '$lib/types/igdb';

export type IgdbImportPhase = 'preparing' | 'checking' | 'importing' | 'finalizing';

export interface IgdbImportProgress {
	startedAt: string;
	syncFrom: string | null;
	syncThrough: string | null;
	phase: IgdbImportPhase;
	importedGames: number;
	totalGames: number | null;
	pendingGames: number | null;
}

export interface IgdbImportFailure {
	failedAt: string;
}

export interface IgdbImportStatus {
	schedule: string;
	timeZone: 'UTC';
	nextImportAt: string | null;
	lastSuccessfulImportAt: string | null;
	activeImport: IgdbImportProgress | null;
	lastFailure: IgdbImportFailure | null;
}

export function constructImageUrl(imageId: string, size: ImageSize): string {
	return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.webp`;
}
