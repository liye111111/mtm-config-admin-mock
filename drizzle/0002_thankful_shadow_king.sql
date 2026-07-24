DROP TABLE IF EXISTS `product_bindings`;--> statement-breakpoint
CREATE TABLE `product_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`shopify_product_gid` text NOT NULL,
	`shopify_product_id` text NOT NULL,
	`product_title` text NOT NULL,
	`product_handle` text NOT NULL,
	`product_image_url` text,
	`product_image_alt` text,
	`product_status` text NOT NULL,
	`product_kind` text NOT NULL,
	`variant_count` integer DEFAULT 0 NOT NULL,
	`online_store_url` text,
	`shopify_admin_url` text,
	`template_id` text NOT NULL,
	`published_version` integer,
	`enabled` integer DEFAULT 1 NOT NULL,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`sync_error` text,
	`shopify_updated_at` text,
	`last_synced_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
CREATE UNIQUE INDEX `product_bindings_shop_gid_idx` ON `product_bindings` (`shop_id`,`shopify_product_gid`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_bindings_shop_product_id_idx` ON `product_bindings` (`shop_id`,`shopify_product_id`);
