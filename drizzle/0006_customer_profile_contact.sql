ALTER TABLE `measurement_profiles` ADD `customer_email` text;
--> statement-breakpoint
ALTER TABLE `measurement_profiles` ADD `customer_name` text;
--> statement-breakpoint
CREATE INDEX `measurement_profiles_email_idx` ON `measurement_profiles` (`shop_id`,`customer_email`);
--> statement-breakpoint
UPDATE `measurement_profiles`
SET `customer_email` = (
  SELECT COALESCE(json_extract(`payload_json`, '$.customer.email'), json_extract(`payload_json`, '$.email'), json_extract(`payload_json`, '$.contact_email'))
  FROM `order_webhook_snapshots`
  WHERE `order_webhook_snapshots`.`shop_id` = `measurement_profiles`.`shop_id`
    AND CAST(json_extract(`payload_json`, '$.customer.id') AS TEXT) = `measurement_profiles`.`customer_id`
  ORDER BY `received_at` DESC
  LIMIT 1
),
`customer_name` = (
  SELECT trim(COALESCE(json_extract(`payload_json`, '$.customer.first_name'), '') || ' ' || COALESCE(json_extract(`payload_json`, '$.customer.last_name'), ''))
  FROM `order_webhook_snapshots`
  WHERE `order_webhook_snapshots`.`shop_id` = `measurement_profiles`.`shop_id`
    AND CAST(json_extract(`payload_json`, '$.customer.id') AS TEXT) = `measurement_profiles`.`customer_id`
  ORDER BY `received_at` DESC
  LIMIT 1
)
WHERE `customer_id` IS NOT NULL;
