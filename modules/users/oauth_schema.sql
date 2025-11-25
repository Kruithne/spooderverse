-- oauth provider configurations
CREATE TABLE `oauth_providers` (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`provider_name` VARCHAR(50) NOT NULL,
	`client_id` VARCHAR(255) NOT NULL,
	`client_secret` VARCHAR(255) NOT NULL,
	`auth_endpoint` VARCHAR(500) NOT NULL,
	`token_endpoint` VARCHAR(500) NOT NULL,
	`userinfo_endpoint` VARCHAR(500) NOT NULL,
	UNIQUE KEY `uk_provider` (`provider_name`)
);

-- link users to oauth identities
CREATE TABLE `oauth_accounts` (
	`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`user_id` BIGINT UNSIGNED NOT NULL,
	`provider_id` INT UNSIGNED NOT NULL,
	`provider_user_id` VARCHAR(255) NOT NULL,
	`linked_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE KEY `uk_provider_user` (`provider_id`, `provider_user_id`),
	INDEX `idx_user_id` (`user_id`),
	INDEX `idx_provider_id` (`provider_id`),
	CONSTRAINT `fk_oauth_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `user_accounts` (`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_oauth_accounts_provider` FOREIGN KEY (`provider_id`) REFERENCES `oauth_providers` (`id`) ON DELETE CASCADE
);

-- csrf protection for oauth flow
CREATE TABLE `oauth_state_tokens` (
	`state` VARCHAR(64) NOT NULL PRIMARY KEY,
	`provider_id` INT UNSIGNED NOT NULL,
	`redirect_uri` VARCHAR(500) NOT NULL,
	`created` BIGINT UNSIGNED NOT NULL,
	INDEX `idx_created` (`created`),
	CONSTRAINT `fk_oauth_state_provider` FOREIGN KEY (`provider_id`) REFERENCES `oauth_providers` (`id`) ON DELETE CASCADE
);

-- insert google and microsoft providers
INSERT INTO `oauth_providers` (`provider_name`, `client_id`, `client_secret`, `auth_endpoint`, `token_endpoint`, `userinfo_endpoint`) VALUES
('google', '', '', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v2/userinfo'),
('microsoft', '', '', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'https://login.microsoftonline.com/common/oauth2/v2.0/token', 'https://graph.microsoft.com/v1.0/me');
