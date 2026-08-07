PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_oauth_account` (
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`encrypted_access_token` blob NOT NULL,
	`encrypted_refresh_token` blob,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `provider_user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_account`("provider", "provider_user_id", "encrypted_access_token", "encrypted_refresh_token", "user_id", "created_at") SELECT "provider", "provider_user_id", "encrypted_access_token", "encrypted_refresh_token", "user_id", "created_at" FROM `oauth_account`;--> statement-breakpoint
DROP TABLE `oauth_account`;--> statement-breakpoint
ALTER TABLE `__new_oauth_account` RENAME TO `oauth_account`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `oauth_account_user_id_idx` ON `oauth_account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_account_provider_user_id_unique` ON `oauth_account` (`provider`,`user_id`);