CREATE TABLE `measurement_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`customer_id` text,
	`guest_id_hash` text,
	`unit` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`measurements_json` text NOT NULL,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CHECK ((`customer_id` IS NOT NULL AND `guest_id_hash` IS NULL) OR (`customer_id` IS NULL AND `guest_id_hash` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_profiles_customer_idx` ON `measurement_profiles` (`shop_id`,`customer_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_profiles_guest_idx` ON `measurement_profiles` (`shop_id`,`guest_id_hash`);
--> statement-breakpoint
CREATE INDEX `measurement_profiles_expiry_idx` ON `measurement_profiles` (`expires_at`);
