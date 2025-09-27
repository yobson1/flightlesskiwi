type IGDBExternalGame = {
	checksum: string;
	countries?: number[];
	created_at: number;
	external_game_source: GameSource;
	game: number;
	game_release_format: number;
	name: string;
	uid: string;
	updated_at: number;
	url: string;
	year?: number;
};

type IGDBCompany = {
	id: number;
	name: string;
	websites?: { url: string }[];
};

type IGDBInvolvedCompany = {
	id: number;
	company: number;
	developer: boolean;
	publisher: boolean;
};

type IGDBCover = {
	id: number;
	image_id: string;
};

type ImageSize =
	| 'cover_small'
	| 'cover_big'
	| 'screenshot_med'
	| 'screenshot_big'
	| 'screenshot_huge'
	| 'logo_med'
	| 'thumb'
	| 'micro'
	| '720p'
	| '1080p';
