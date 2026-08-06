import { relations, sql } from 'drizzle-orm';
import {
	type AnySQLiteColumn,
	blob,
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	unique
} from 'drizzle-orm/sqlite-core';
import {
	MAX_BENCHMARK_DESCRIPTION_LENGTH,
	MAX_BENCHMARK_FILE_NAME_LENGTH,
	MAX_BENCHMARK_FILE_SIZE,
	MAX_BENCHMARK_TITLE_LENGTH
} from '../../benchmark';

export const user = sqliteTable(
	'user',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull().unique(),
		username: text('username').notNull().unique(),
		passwordHash: text('password_hash'),
		emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
		recoveryCodeHash: text('recovery_code_hash'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('user_email_idx').on(table.email)]
);

export const oauthAccount = sqliteTable(
	'oauth_account',
	{
		provider: text('provider', { enum: ['github', 'discord', 'twitch'] }).notNull(),
		providerUserId: text('provider_user_id').notNull(),
		encryptedAccessToken: blob('encrypted_access_token', { mode: 'buffer' }),
		encryptedRefreshToken: blob('encrypted_refresh_token', { mode: 'buffer' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.provider, table.providerUserId] }),
		unique('oauth_account_provider_user_id_unique').on(table.provider, table.userId),
		index('oauth_account_user_id_idx').on(table.userId)
	]
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
		lastReauthenticatedAt: integer('last_reauthenticated_at', { mode: 'timestamp_ms' }),
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
	encryptedKey: blob('encrypted_key', { mode: 'buffer' }).notNull(),
	lastUsedCounter: integer('last_used_counter')
});

export const passkeyCredential = sqliteTable(
	'passkey_credential',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		aaguid: text('aaguid'),
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
			enum: [
				'passkey-login',
				'passkey-register',
				'passkey-2fa',
				'password-reset-2fa',
				'settings-reauth'
			]
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

export const benchmarkResult = sqliteTable(
	'benchmark_result',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		gameId: integer('game_id')
			.notNull()
			.references(() => game.id),
		title: text('title').notNull(),
		description: text('description'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		index('benchmark_result_user_id_idx').on(table.userId),
		index('benchmark_result_game_id_idx').on(table.gameId),
		index('benchmark_result_created_at_idx').on(table.createdAt),
		check(
			'benchmark_result_title_length_check',
			sql`length(${table.title}) between 1 and ${sql.raw(String(MAX_BENCHMARK_TITLE_LENGTH))}`
		),
		check(
			'benchmark_result_description_length_check',
			sql`${table.description} is null or length(${table.description}) <= ${sql.raw(String(MAX_BENCHMARK_DESCRIPTION_LENGTH))}`
		)
	]
);

export const benchmarkFile = sqliteTable(
	'benchmark_file',
	{
		id: text('id').primaryKey(),
		benchmarkId: text('benchmark_id')
			.notNull()
			.references(() => benchmarkResult.id, { onDelete: 'cascade' }),
		originalName: text('original_name').notNull(),
		size: integer('size').notNull()
	},
	(table) => [
		index('benchmark_file_benchmark_id_idx').on(table.benchmarkId),
		check(
			'benchmark_file_original_name_length_check',
			sql`length(${table.originalName}) between 1 and ${sql.raw(String(MAX_BENCHMARK_FILE_NAME_LENGTH))}`
		),
		check(
			'benchmark_file_size_check',
			sql`${table.size} between 1 and ${sql.raw(String(MAX_BENCHMARK_FILE_SIZE))}`
		)
	]
);

export const searchIndexQueue = sqliteTable(
	'search_index_queue',
	{
		indexName: text('index_name').notNull(),
		documentId: text('document_id').notNull(),
		revision: integer('revision').notNull().default(1)
	},
	(table) => [primaryKey({ columns: [table.indexName, table.documentId] })]
);

export const syncState = sqliteTable('sync_state', {
	lastSync: integer('last_sync', { mode: 'timestamp' }).notNull()
});

// Relations for game data tables
export const gameRelations = relations(game, ({ many, one }) => ({
	names: many(gameName),
	storeLinks: many(storeLink),
	involvedCompanies: many(involvedCompany),
	usedEngines: many(usedEngine),
	benchmarks: many(benchmarkResult),
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
	oauthAccounts: many(oauthAccount),
	totpCredential: one(totpCredential),
	passkeyCredentials: many(passkeyCredential),
	emailVerificationRequests: many(emailVerificationRequest),
	passwordResetSessions: many(passwordResetSession),
	benchmarks: many(benchmarkResult)
}));

export const oauthAccountRelations = relations(oauthAccount, ({ one }) => ({
	user: one(user, {
		fields: [oauthAccount.userId],
		references: [user.id]
	})
}));

export const benchmarkResultRelations = relations(benchmarkResult, ({ many, one }) => ({
	user: one(user, {
		fields: [benchmarkResult.userId],
		references: [user.id]
	}),
	game: one(game, {
		fields: [benchmarkResult.gameId],
		references: [game.id]
	}),
	files: many(benchmarkFile)
}));

export const benchmarkFileRelations = relations(benchmarkFile, ({ one }) => ({
	benchmark: one(benchmarkResult, {
		fields: [benchmarkFile.benchmarkId],
		references: [benchmarkResult.id]
	})
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
export type OAuthAccount = typeof oauthAccount.$inferSelect;
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
export type BenchmarkResult = typeof benchmarkResult.$inferSelect;
export type BenchmarkFile = typeof benchmarkFile.$inferSelect;

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
