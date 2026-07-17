CREATE TABLE `product_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`shopify_product_id` text NOT NULL,
	`product_title` text NOT NULL,
	`product_handle` text,
	`template_id` text NOT NULL,
	`published_version` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`config_json` text NOT NULL,
	`published_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_code_idx` ON `templates` (`code`);