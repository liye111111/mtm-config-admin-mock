ALTER TABLE `measurement_attributes` ADD `min_value` real NOT NULL DEFAULT 0;
ALTER TABLE `measurement_attributes` ADD `max_value` real NOT NULL DEFAULT 250;
ALTER TABLE `measurement_attributes` ADD `step_value` real NOT NULL DEFAULT 1;
ALTER TABLE `measurement_attributes` ADD `image_json` text;
UPDATE `measurement_attributes` SET `min_value` = CASE `code` WHEN 'height' THEN 120 WHEN 'weight' THEN 30 WHEN 'chest' THEN 50 WHEN 'waist' THEN 45 WHEN 'hip' THEN 50 WHEN 'shoulder_width' THEN 30 WHEN 'sleeve_length' THEN 30 WHEN 'inseam' THEN 40 WHEN 'neck' THEN 25 WHEN 'foot_length' THEN 180 WHEN 'foot_width' THEN 60 ELSE `min_value` END;
UPDATE `measurement_attributes` SET `max_value` = CASE `code` WHEN 'height' THEN 230 WHEN 'weight' THEN 250 WHEN 'chest' THEN 180 WHEN 'waist' THEN 180 WHEN 'hip' THEN 180 WHEN 'shoulder_width' THEN 70 WHEN 'sleeve_length' THEN 100 WHEN 'inseam' THEN 120 WHEN 'neck' THEN 70 WHEN 'foot_length' THEN 350 WHEN 'foot_width' THEN 150 ELSE `max_value` END;
UPDATE `measurement_attributes` SET `step_value` = CASE WHEN `precision` = 0 THEN 1 ELSE 0.1 END;
