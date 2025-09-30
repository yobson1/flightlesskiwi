export type ImageSize =
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

interface Cover {
	id: number;
	image_id: string;
}

export interface ExternalGame {
	id: number;
	url: string;
	external_game_source: number;
}

export interface GameEngine {
	id: number;
	name: string;
	url: string;
}

export interface Website {
	id: number;
	url: string;
	type: number;
}

export interface Company {
	id: number;
	name: string;
	websites?: Website[];
}

export interface InvolvedCompany {
	id: number;
	company: Company;
	developer: boolean;
	publisher: boolean;
}

export interface Game {
	id: number;
	cover: Cover;
	external_games?: ExternalGame[];
	websites?: Website[];
	first_release_date: number;
	game_engines?: GameEngine[];
	involved_companies?: InvolvedCompany[];
	name: string;
}

export interface GameSearchResult {
	id: number;
	name: string;
	first_release_date: number;
	cover: Cover;
	parent_game?: number;
	version_parent?: number;
}
