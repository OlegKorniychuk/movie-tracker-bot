DROP INDEX `movies_normalized_title_year_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `movies_normalized_title_idx` ON `movies` (`normalized_title`);