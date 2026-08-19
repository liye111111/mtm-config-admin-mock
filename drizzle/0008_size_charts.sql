CREATE TABLE `size_charts` (
  `id` text PRIMARY KEY NOT NULL,
  `shop_id` text NOT NULL,
  `code` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'active' NOT NULL,
  `current_version_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (`status` IN ('active','disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `size_charts_shop_code_idx` ON `size_charts` (`shop_id`,`code`);
--> statement-breakpoint
CREATE TABLE `size_chart_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `size_chart_id` text NOT NULL,
  `version` integer NOT NULL,
  `status` text NOT NULL,
  `algorithm_code` text NOT NULL,
  `algorithm_version` integer NOT NULL,
  `config_json` text NOT NULL,
  `created_at` text NOT NULL,
  `published_at` text,
  CHECK (`status` IN ('draft','published','archived')),
  CHECK (`algorithm_code` IN ('range_matrix','nearest_profile','direct_lookup')),
  FOREIGN KEY (`size_chart_id`) REFERENCES `size_charts`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `size_chart_versions_chart_version_idx` ON `size_chart_versions` (`size_chart_id`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `size_chart_versions_one_draft_idx` ON `size_chart_versions` (`size_chart_id`) WHERE `status`='draft';
--> statement-breakpoint
CREATE INDEX `size_chart_versions_status_idx` ON `size_chart_versions` (`size_chart_id`,`status`);
