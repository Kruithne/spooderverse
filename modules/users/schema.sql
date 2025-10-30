CREATE TABLE `user_accounts` (
	`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`email` VARCHAR(254) NOT NULL,
	`password` VARCHAR(255) NOT NULL,
	`first_name` VARCHAR(50) NOT NULL,
	`last_name` VARCHAR(50) NOT NULL,
	`registered` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`flags` INT UNSIGNED NOT NULL DEFAULT 0,
	UNIQUE KEY `uk_email` (`email`)
);

CREATE TABLE `user_sessions` (
	`session_id` VARCHAR(36) NOT NULL PRIMARY KEY,
	`user_id` BIGINT UNSIGNED NOT NULL,
	`user_updated_timestamp` BIGINT UNSIGNED NOT NULL,
	INDEX `idx_user_id` (`user_id`)
);

CREATE TABLE `user_verify_codes` (
	`token` VARCHAR(16) NOT NULL PRIMARY KEY,
	`code` VARCHAR(5) NOT NULL,
	`user_id` BIGINT UNSIGNED NOT NULL,
	`last_sent` BIGINT UNSIGNED NOT NULL,
	INDEX `idx_user_id` (`user_id`)
);

CREATE TABLE `user_reset_tokens` (
	`reset_token` VARCHAR(36) NOT NULL PRIMARY KEY,
	`user_id` BIGINT UNSIGNED NOT NULL,
	`reset_sent` BIGINT UNSIGNED NOT NULL,
	UNIQUE KEY `uk_user_id` (`user_id`)
);

CREATE TABLE `user_permissions` (
	`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`fk_users_id` BIGINT UNSIGNED NOT NULL,
	`permission` INT UNSIGNED NOT NULL,
	UNIQUE KEY `uk_user_permission` (`fk_users_id`, `permission`),
	INDEX `idx_fk_users_id` (`fk_users_id`)
);