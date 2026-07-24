export interface GameSearchResult {
	id: number;
	name: string;
	releaseDate: string | null;
	coverImgId: string | null;
	parentGame: number | null;
	versionParent: number | null;
}
