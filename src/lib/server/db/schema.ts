import { relations } from 'drizzle-orm';
import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	age: integer('age')
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

// Game data from IGDB tables
export const store = sqliteTable('store', {
	id: integer('id').primaryKey(),
	name: text('name').notNull()
});

export const storeLink = sqliteTable(
	'store_link',
	{
		gameId: integer('game_id')
			.notNull()
			.references(() => game.id),
		storeId: integer('store_id')
			.notNull()
			.references(() => store.id),
		url: text('url').notNull()
	},
	(table) => ({
		pk: primaryKey({ columns: [table.gameId, table.storeId] })
	})
);

export const gameEngine = sqliteTable('game_engine', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	url: text('url')
});

export const usedEngine = sqliteTable(
	'used_engine',
	{
		gameId: integer('game_id')
			.notNull()
			.references(() => game.id),
		engineId: integer('engine_id')
			.notNull()
			.references(() => gameEngine.id)
	},
	(table) => ({
		pk: primaryKey({ columns: [table.gameId, table.engineId] })
	})
);

export const company = sqliteTable('company', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	url: text('url')
});

export const involvedCompany = sqliteTable(
	'involved_company',
	{
		gameId: integer('game_id')
			.notNull()
			.references(() => game.id),
		companyId: integer('company_id')
			.notNull()
			.references(() => company.id),
		developer: integer('developer', { mode: 'boolean' }).notNull(),
		publisher: integer('publisher', { mode: 'boolean' }).notNull()
	},
	(table) => ({
		pk: primaryKey({ columns: [table.gameId, table.companyId] })
	})
);

export const alternativeName = sqliteTable('alternative_name', {
	id: integer('id').primaryKey(),
	gameId: integer('game_id')
		.notNull()
		.references(() => game.id),
	name: text('name').notNull()
});

export const game = sqliteTable('game', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	releaseDate: integer('release_date', { mode: 'timestamp' }),
	coverImgId: text('cover_img_id'),
	parentGame: integer('parent_game_id').references((): any => game.id),
	versionParent: integer('version_parent_id').references((): any => game.id)
});

export const syncState = sqliteTable('sync_state', {
	lastSync: integer('last_sync', { mode: 'timestamp' }).notNull()
});

// Relations for game data tables
export const gameRelations = relations(game, ({ many, one }) => ({
	alternativeNames: many(alternativeName),
	storeLinks: many(storeLink),
	involvedCompanies: many(involvedCompany),
	usedEngines: many(usedEngine),
	parentGameRef: one(game, {
		fields: [game.parentGame],
		references: [game.id],
		relationName: 'parentGame'
	}),
	versionParentRef: one(game, {
		fields: [game.versionParent],
		references: [game.id],
		relationName: 'versionParent'
	}),
	childGames: many(game, { relationName: 'parentGame' }),
	versions: many(game, { relationName: 'versionParent' })
}));

export const alternativeNameRelations = relations(alternativeName, ({ one }) => ({
	game: one(game, {
		fields: [alternativeName.gameId],
		references: [game.id]
	})
}));

export const storeLinkRelations = relations(storeLink, ({ one }) => ({
	game: one(game, {
		fields: [storeLink.gameId],
		references: [game.id]
	}),
	store: one(store, {
		fields: [storeLink.storeId],
		references: [store.id]
	})
}));

export const storeRelations = relations(store, ({ many }) => ({
	storeLinks: many(storeLink)
}));

export const involvedCompanyRelations = relations(involvedCompany, ({ one }) => ({
	game: one(game, {
		fields: [involvedCompany.gameId],
		references: [game.id]
	}),
	company: one(company, {
		fields: [involvedCompany.companyId],
		references: [company.id]
	})
}));

export const companyRelations = relations(company, ({ many }) => ({
	involvedCompanies: many(involvedCompany)
}));

export const usedEngineRelations = relations(usedEngine, ({ one }) => ({
	game: one(game, {
		fields: [usedEngine.gameId],
		references: [game.id]
	}),
	engine: one(gameEngine, {
		fields: [usedEngine.engineId],
		references: [gameEngine.id]
	})
}));

export const gameEngineRelations = relations(gameEngine, ({ many }) => ({
	usedEngines: many(usedEngine)
}));

export const STORES = {
	STEAM: { id: 0, name: 'Steam' },
	GOG: { id: 1, name: 'GOG' },
	ITCH: { id: 2, name: 'Itch.io' },
	EPIC: { id: 3, name: 'Epic Games Store' }
};

export type Session = typeof session.$inferSelect;
export type User = typeof user.$inferSelect;
export type Store = typeof store.$inferSelect;
export type StoreLink = typeof storeLink.$inferSelect;
export type GameEngine = typeof gameEngine.$inferSelect;
export type UsedEngine = typeof usedEngine.$inferSelect;
export type Company = typeof company.$inferSelect;
export type InvolvedCompany = typeof involvedCompany.$inferSelect;
export type Game = typeof game.$inferSelect;
export type AlternativeName = typeof alternativeName.$inferSelect;

export type FullGame = Game & {
	storeLinks: (StoreLink & {
		store: Store;
	})[];
	involvedCompanies: (InvolvedCompany & {
		company: Company;
	})[];
	usedEngines: (UsedEngine & {
		engine: GameEngine;
	})[];
};
