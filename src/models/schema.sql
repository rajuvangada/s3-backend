-- Database Schema for StudentVault

CREATE DATABASE IF NOT EXISTS `studentvault`;
USE `studentvault`;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `Users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `profile_image` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Folders Table
CREATE TABLE IF NOT EXISTS `Folders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `folder_name` VARCHAR(255) NOT NULL,
  `parent_folder_id` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `Users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`parent_folder_id`) REFERENCES `Folders`(`id`) ON DELETE CASCADE,
  INDEX `idx_folders_user` (`user_id`),
  INDEX `idx_folders_parent` (`parent_folder_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Files Table
-- We use a UUID (VARCHAR(36)) for File IDs to prevent sequential ID guessing/enumeration of resources.
CREATE TABLE IF NOT EXISTS `Files` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` INT NOT NULL,
  `folder_id` INT DEFAULT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `file_type` VARCHAR(100) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `s3_key` VARCHAR(512) NOT NULL,
  `is_favorite` TINYINT(1) DEFAULT 0,
  `is_deleted` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `Users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`folder_id`) REFERENCES `Folders`(`id`) ON DELETE SET NULL,
  INDEX `idx_files_user` (`user_id`),
  INDEX `idx_files_folder` (`folder_id`),
  INDEX `idx_files_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Shared Links Table
-- Access tokens are generated as secure UUIDs/hashes. Expiry date checks are enforced.
CREATE TABLE IF NOT EXISTS `SharedLinks` (
  `id` VARCHAR(36) PRIMARY KEY,
  `file_id` VARCHAR(36) NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `permission` VARCHAR(50) DEFAULT 'read',
  `expiry_date` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`file_id`) REFERENCES `Files`(`id`) ON DELETE CASCADE,
  INDEX `idx_shares_token` (`token`),
  INDEX `idx_shares_file` (`file_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Activity Logs Table
CREATE TABLE IF NOT EXISTS `ActivityLogs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL,
  `action` VARCHAR(50) NOT NULL, -- 'Upload', 'Download', 'Delete', 'Rename', 'Share', 'Login', 'Logout'
  `details` TEXT DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `Users`(`id`) ON DELETE SET NULL,
  INDEX `idx_activities_user` (`user_id`),
  INDEX `idx_activities_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Notifications Table
CREATE TABLE IF NOT EXISTS `Notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `Users`(`id`) ON DELETE CASCADE,
  INDEX `idx_notifications_user` (`user_id`),
  INDEX `idx_notifications_read` (`is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
