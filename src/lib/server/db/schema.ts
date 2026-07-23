import { relations } from 'drizzle-orm';
import {
	type AnySQLiteColumn,
	blob,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	unique
} from 'drizzle-orm/sqlite-core';

export const user = sqliteTable(
	'user',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull().unique(),
		username: text('username').notNull(),
		passwordHash: text('password_hash').notNull(),
		emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
		recoveryCodeHash: text('recovery_code_hash'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('user_email_idx').on(table.email)]
);

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		secretHash: blob('secret_hash', { mode: 'buffer' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp_ms' }).notNull(),
		twoFactorVerified: integer('two_factor_verified', { mode: 'boolean' }).notNull().default(false)
	},
	(table) => [index('session_user_id_idx').on(table.userId)]
);

export const loginAttempt = sqliteTable(
	'login_attempt',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		secretHash: blob('secret_hash', { mode: 'buffer' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		index('login_attempt_user_id_idx').on(table.userId),
		index('login_attempt_expires_at_idx').on(table.expiresAt)
	]
);

export const emailVerificationRequest = sqliteTable(
	'email_verification_request',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		codeHash: blob('code_hash', { mode: 'buffer' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [unique('email_verification_request_user_id_unique').on(table.userId)]
);

export const passwordResetSession = sqliteTable(
	'password_reset_session',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		secretHash: blob('secret_hash', { mode: 'buffer' }).notNull(),
		email: text('email').notNull(),
		codeHash: blob('code_hash', { mode: 'buffer' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
		twoFactorVerified: integer('two_factor_verified', { mode: 'boolean' }).notNull().default(false)
	},
	(table) => [index('password_reset_session_user_id_idx').on(table.userId)]
);

export const totpCredential = sqliteTable('totp_credential', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	encryptedKey: blob('encrypted_key', { mode: 'buffer' }).notNull()
});

export const passkeyCredential = sqliteTable(
	'passkey_credential',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		algorithm: integer('algorithm').notNull(),
		publicKey: blob('public_key', { mode: 'buffer' }).notNull(),
		signCount: integer('sign_count').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('passkey_credential_user_id_idx').on(table.userId)]
);

export const webAuthnChallenge = sqliteTable(
	'webauthn_challenge',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		purpose: text('purpose', {
			enum: ['passkey-login', 'passkey-register', 'passkey-2fa', 'password-reset-2fa']
		}).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('webauthn_challenge_expires_at_idx').on(table.expiresAt)]
);

export const authRateLimit = sqliteTable('auth_rate_limit', {
	id: text('id').primaryKey(),
	tokens: integer('tokens').notNull(),
	refilledAt: integer('refilled_at', { mode: 'timestamp_ms' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
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
	(table) => [primaryKey({ columns: [table.gameId, table.storeId] })]
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
	(table) => [primaryKey({ columns: [table.gameId, table.engineId] })]
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
	(table) => [primaryKey({ columns: [table.gameId, table.companyId] })]
);

export const gameName = sqliteTable(
	'game_name',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		gameId: integer('game_id')
			.notNull()
			.references(() => game.id),
		name: text('name').notNull(),
		isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false)
	},
	(table) => [unique().on(table.gameId, table.name)]
);

export const game = sqliteTable('game', {
	id: integer('id').primaryKey(),
	releaseDate: integer('release_date', { mode: 'timestamp' }),
	coverImgId: text('cover_img_id'),
	parentGame: integer('parent_game_id').references((): AnySQLiteColumn => game.id),
	versionParent: integer('version_parent_id').references((): AnySQLiteColumn => game.id)
});

export const gameSearchQueue = sqliteTable('game_search_queue', {
	gameId: integer('game_id')
		.primaryKey()
		.references(() => game.id)
});

export const syncState = sqliteTable('sync_state', {
	lastSync: integer('last_sync', { mode: 'timestamp' }).notNull()
});

// Relations for game data tables
export const gameRelations = relations(game, ({ many, one }) => ({
	names: many(gameName),
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

export const gameNameRelations = relations(gameName, ({ one }) => ({
	game: one(game, {
		fields: [gameName.gameId],
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

export const userRelations = relations(user, ({ many, one }) => ({
	sessions: many(session),
	loginAttempts: many(loginAttempt),
	totpCredential: one(totpCredential),
	passkeyCredentials: many(passkeyCredential),
	emailVerificationRequests: many(emailVerificationRequest),
	passwordResetSessions: many(passwordResetSession)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const loginAttemptRelations = relations(loginAttempt, ({ one }) => ({
	user: one(user, {
		fields: [loginAttempt.userId],
		references: [user.id]
	})
}));

export const totpCredentialRelations = relations(totpCredential, ({ one }) => ({
	user: one(user, {
		fields: [totpCredential.userId],
		references: [user.id]
	})
}));

export const passkeyCredentialRelations = relations(passkeyCredential, ({ one }) => ({
	user: one(user, {
		fields: [passkeyCredential.userId],
		references: [user.id]
	})
}));

export const STORES = {
	STEAM: { id: 0, name: 'Steam' },
	GOG: { id: 1, name: 'GOG' },
	ITCH: { id: 2, name: 'Itch.io' },
	EPIC: { id: 3, name: 'Epic Games Store' }
} as const;

export type Session = typeof session.$inferSelect;
export type LoginAttempt = typeof loginAttempt.$inferSelect;
export type User = typeof user.$inferSelect;
export type PasskeyCredential = typeof passkeyCredential.$inferSelect;
export type PasswordResetSession = typeof passwordResetSession.$inferSelect;
export type EmailVerificationRequest = typeof emailVerificationRequest.$inferSelect;
export type Store = typeof store.$inferSelect;
export type StoreLink = typeof storeLink.$inferSelect;
export type GameEngine = typeof gameEngine.$inferSelect;
export type UsedEngine = typeof usedEngine.$inferSelect;
export type Company = typeof company.$inferSelect;
export type InvolvedCompany = typeof involvedCompany.$inferSelect;
export type Game = typeof game.$inferSelect;
export type GameName = typeof gameName.$inferSelect;

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
	names: GameName[];
};
