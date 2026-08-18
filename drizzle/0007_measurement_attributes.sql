CREATE TABLE `measurement_attributes` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`value_type` text NOT NULL,
	`dimension` text NOT NULL,
	`canonical_unit` text NOT NULL,
	`precision` integer DEFAULT 1 NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_attributes_shop_code_idx` ON `measurement_attributes` (`shop_id`,`code`);
--> statement-breakpoint
CREATE INDEX `measurement_attributes_shop_status_idx` ON `measurement_attributes` (`shop_id`,`enabled`);
