import * as v from 'valibot';

type BaseImageSize =
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

export type ImageSize = BaseImageSize | `${BaseImageSize}_2x`;

export const coverSchema = v.object({ image_id: v.string() });
export type Cover = v.InferOutput<typeof coverSchema>;

export const externalGameSchema = v.object({
	url: v.optional(v.string()),
	external_game_source: v.number()
});
export type ExternalGame = v.InferOutput<typeof externalGameSchema>;

export const gameEngineSchema = v.object({
	id: v.number(),
	name: v.string(),
	url: v.optional(v.string())
});
export type GameEngine = v.InferOutput<typeof gameEngineSchema>;

export const websiteSchema = v.object({ url: v.string(), type: v.number() });
export type Website = v.InferOutput<typeof websiteSchema>;

export const companyWebsiteSchema = v.object({
	url: v.string(),
	type: v.optional(v.number())
});

export const companySchema = v.object({
	id: v.number(),
	name: v.string(),
	websites: v.optional(v.array(companyWebsiteSchema))
});
export type Company = v.InferOutput<typeof companySchema>;

export const involvedCompanySchema = v.object({
	company: companySchema,
	developer: v.boolean(),
	publisher: v.boolean()
});
export type InvolvedCompany = v.InferOutput<typeof involvedCompanySchema>;

export const alternativeNameSchema = v.object({ name: v.string() });
export type AlternativeName = v.InferOutput<typeof alternativeNameSchema>;

export const igdbGameSchema = v.object({
	id: v.number(),
	name: v.string(),
	cover: v.optional(coverSchema),
	external_games: v.optional(v.array(externalGameSchema)),
	websites: v.optional(v.array(websiteSchema)),
	first_release_date: v.optional(v.number()),
	game_engines: v.optional(v.array(gameEngineSchema)),
	involved_companies: v.optional(v.array(involvedCompanySchema)),
	alternative_names: v.optional(v.array(alternativeNameSchema)),
	parent_game: v.optional(v.number()),
	version_parent: v.optional(v.number())
});
export const igdbGamesSchema = v.array(igdbGameSchema);
export type Game = v.InferOutput<typeof igdbGameSchema>;
