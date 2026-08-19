CREATE TABLE `product_type_size_chart_bindings` (
  `id` text PRIMARY KEY NOT NULL,
  `shop_id` text NOT NULL,
  `product_type` text NOT NULL,
  `normalized_product_type` text NOT NULL,
  `size_chart_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`size_chart_id`) REFERENCES `size_charts`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_type_size_chart_bindings_shop_type_idx`
  ON `product_type_size_chart_bindings` (`shop_id`,`normalized_product_type`);
--> statement-breakpoint
CREATE INDEX `product_type_size_chart_bindings_chart_idx`
  ON `product_type_size_chart_bindings` (`shop_id`,`size_chart_id`);
