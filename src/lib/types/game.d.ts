type Platform = {
	name: string;
	url: string;
	game_source: GameSource;
};

type Company = {
	name: string;
	url?: string;
};

type Engine = {
	name: string;
	url?: string;
};

type Game = {
	name: string;
	cover_url: string;
	platforms: Platform[];
	developers: Company[];
	publishers: Company[];
	engines: Engine[];
	release_date: string | undefined;
};
