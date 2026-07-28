CREATE TABLE `auth_rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`tokens` integer NOT NULL,
	`refilled_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `benchmark_file` (
	`id` text PRIMARY KEY NOT NULL,
	`benchmark_id` text NOT NULL,
	`original_name` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`benchmark_id`) REFERENCES `benchmark_result`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "benchmark_file_original_name_length_check" CHECK(length("benchmark_file"."original_name") between 1 and 255),
	CONSTRAINT "benchmark_file_size_check" CHECK("benchmark_file"."size" between 1 and 5242880)
);
--> statement-breakpoint
CREATE INDEX `benchmark_file_benchmark_id_idx` ON `benchmark_file` (`benchmark_id`);--> statement-breakpoint
CREATE TABLE `benchmark_result` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "benchmark_result_title_length_check" CHECK(length("benchmark_result"."title") between 1 and 120),
	CONSTRAINT "benchmark_result_description_length_check" CHECK("benchmark_result"."description" is null or length("benchmark_result"."description") <= 2000)
);
--> statement-breakpoint
CREATE INDEX `benchmark_result_user_id_idx` ON `benchmark_result` (`user_id`);--> statement-breakpoint
CREATE INDEX `benchmark_result_game_id_idx` ON `benchmark_result` (`game_id`);--> statement-breakpoint
CREATE INDEX `benchmark_result_created_at_idx` ON `benchmark_result` (`created_at`);--> statement-breakpoint
CREATE TABLE `company` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text
);
--> statement-breakpoint
CREATE TABLE `email_verification_request` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`code_hash` blob NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verification_request_user_id_unique` ON `email_verification_request` (`user_id`);--> statement-breakpoint
CREATE TABLE `game` (
	`id` integer PRIMARY KEY NOT NULL,
	`release_date` integer,
	`cover_img_id` text,
	`parent_game_id` integer,
	`version_parent_id` integer,
	FOREIGN KEY (`parent_game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_parent_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game_engine` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text
);
--> statement-breakpoint
CREATE TABLE `game_name` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`name` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_name_game_id_name_unique` ON `game_name` (`game_id`,`name`);--> statement-breakpoint
CREATE TABLE `involved_company` (
	`game_id` integer NOT NULL,
	`company_id` integer NOT NULL,
	`developer` integer NOT NULL,
	`publisher` integer NOT NULL,
	PRIMARY KEY(`game_id`, `company_id`),
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`secret_hash` blob NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_attempt_user_id_idx` ON `login_attempt` (`user_id`);--> statement-breakpoint
CREATE INDEX `login_attempt_expires_at_idx` ON `login_attempt` (`expires_at`);--> statement-breakpoint
CREATE TABLE `passkey_credential` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`aaguid` text,
	`algorithm` integer NOT NULL,
	`public_key` blob NOT NULL,
	`sign_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_credential_user_id_idx` ON `passkey_credential` (`user_id`);--> statement-breakpoint
CREATE TABLE `password_reset_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`secret_hash` blob NOT NULL,
	`email` text NOT NULL,
	`code_hash` blob NOT NULL,
	`expires_at` integer NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`two_factor_verified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `password_reset_session_user_id_idx` ON `password_reset_session` (`user_id`);--> statement-breakpoint
CREATE TABLE `search_index_queue` (
	`index_name` text NOT NULL,
	`document_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`index_name`, `document_id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`secret_hash` blob NOT NULL,
	`created_at` integer NOT NULL,
	`last_verified_at` integer NOT NULL,
	`last_reauthenticated_at` integer,
	`two_factor_verified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `store` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_link` (
	`game_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`url` text NOT NULL,
	PRIMARY KEY(`game_id`, `store_id`),
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`last_sync` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `totp_credential` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_key` blob NOT NULL,
	`last_used_counter` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `used_engine` (
	`game_id` integer NOT NULL,
	`engine_id` integer NOT NULL,
	PRIMARY KEY(`game_id`, `engine_id`),
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engine_id`) REFERENCES `game_engine`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`recovery_code_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE INDEX `user_email_idx` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `webauthn_challenge` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webauthn_challenge_expires_at_idx` ON `webauthn_challenge` (`expires_at`);