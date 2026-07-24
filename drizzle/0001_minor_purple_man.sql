ALTER TABLE `product_bindings` ADD `enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `template_versions` ADD `schema_version` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `templates` ADD `schema_version` integer DEFAULT 2 NOT NULL;