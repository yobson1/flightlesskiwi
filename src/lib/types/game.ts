import * as v from 'valibot';

export const gameSearchResultSchema = v.object({
	id: v.number(),
	name: v.string(),
	releaseDate: v.nullable(v.string()),
	coverImgId: v.nullable(v.string()),
	parentGame: v.nullable(v.number()),
	versionParent: v.nullable(v.number())
});

export const gameSearchResultsSchema = v.array(gameSearchResultSchema);

export type GameSearchResult = v.InferOutput<typeof gameSearchResultSchema>;
