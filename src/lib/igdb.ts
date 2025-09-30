import type { ImageSize } from '$lib/types/igdb';

export function constructImageUrl(imageId: string, size: ImageSize): string {
	return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.webp`;
}
