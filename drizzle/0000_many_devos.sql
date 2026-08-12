CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_title` text NOT NULL,
	`original_title` text NOT NULL,
	`ua_title` text NOT NULL,
	`year` integer NOT NULL,
	`countries` text NOT NULL,
	`short_description` text,
	`poster_url` text,
	`imdb_rating` real,
	`cast` text NOT NULL,
	`release_date` text NOT NULL,
	`digested_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_normalized_title_year_idx` ON `movies` (`normalized_title`,`year`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`chat_id` integer PRIMARY KEY NOT NULL,
	`subscribed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracked_picks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`movie_id` integer NOT NULL,
	`picked_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notified_at` text,
	`cancelled_at` text,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_picks_chat_movie_idx` ON `tracked_picks` (`chat_id`,`movie_id`);