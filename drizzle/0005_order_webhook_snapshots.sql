CREATE TABLE `order_webhook_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `shop_id` text NOT NULL,
  `webhook_id` text NOT NULL,
  `topic` text NOT NULL,
  `shopify_order_id` text,
  `payload_json` text NOT NULL,
  `status` text NOT NULL,
  `error` text,
  `received_at` text NOT NULL,
  `processed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_webhook_snapshots_webhook_idx` ON `order_webhook_snapshots` (`webhook_id`);
--> statement-breakpoint
CREATE INDEX `order_webhook_snapshots_order_idx` ON `order_webhook_snapshots` (`shop_id`,`shopify_order_id`);
