CREATE TABLE `template_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_categories_code_idx` ON `template_categories` (`code`);
--> statement-breakpoint
INSERT INTO `template_categories` (`id`,`code`,`name`,`sort_order`,`created_at`,`updated_at`) VALUES
('category-suit','suit','套装',10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('category-jacket','jacket','西服',20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('category-trousers','trousers','西裤',30,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('category-shirt','shirt','衬衫',40,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('category-waistcoat','waistcoat','马甲',50,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('category-curtain','curtain','窗帘',60,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
