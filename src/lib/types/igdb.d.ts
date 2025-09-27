type ExternalGame = {
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
