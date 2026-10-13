CREATE TABLE `ai_providers` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` blob,
	`key_nonce` blob,
	`key_tag` blob,
	`models` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "ai_providers_kind_chk" CHECK(kind IN ('openai','anthropic'))
);
--> statement-breakpoint
CREATE TABLE `auth` (
	`id` integer PRIMARY KEY NOT NULL,
	`kdf` text NOT NULL,
	`salt` blob NOT NULL,
	`verifier` blob NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backups` (
	`id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "backups_kind_chk" CHECK(kind IN ('auto','manual','export'))
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`content_enc` blob,
	`content_nonce` blob,
	`content_tag` blob,
	`tool_calls` text,
	`tool_call_id` text,
	`edited_at` integer,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chat_messages_role_chk" CHECK(role IN ('user','assistant','tool')),
	CONSTRAINT "chat_messages_seq_chk" CHECK(seq >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_session_seq_uq` ON `chat_messages` (`session_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_session` ON `chat_messages` (`session_id`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title_enc` blob,
	`title_nonce` blob,
	`title_tag` blob,
	`provider_id` integer,
	`model` text NOT NULL,
	`summary_enc` blob,
	`summary_nonce` blob,
	`summary_tag` blob,
	`summary_until` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`all_day` integer DEFAULT false NOT NULL,
	`color` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exam_subjects` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_date` text,
	`color` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exam_topics` (
	`id` integer PRIMARY KEY NOT NULL,
	`subject_id` integer NOT NULL,
	`name` text NOT NULL,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `exam_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "exam_topics_progress_chk" CHECK(progress_pct BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE `file_versions` (
	`id` integer PRIMARY KEY NOT NULL,
	`file_id` integer NOT NULL,
	`version` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`content_enc` blob,
	`nonce` blob,
	`tag` blob,
	`dek` blob,
	`dek_nonce` blob,
	`dek_tag` blob,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "file_versions_version_chk" CHECK(version >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_versions_file_version_uq` ON `file_versions` (`file_id`,`version`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`mime` text,
	`size_bytes` integer,
	`is_dir` integer DEFAULT false NOT NULL,
	`content_enc` blob,
	`nonce` blob,
	`tag` blob,
	`dek` blob,
	`dek_nonce` blob,
	`dek_tag` blob,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`deleted_at` integer,
	CONSTRAINT "files_is_dir_chk" CHECK(is_dir IN (0,1)),
	CONSTRAINT "files_version_chk" CHECK(version >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_path_unique` ON `files` (`path`);--> statement-breakpoint
CREATE INDEX `idx_files_path` ON `files` (`path`);--> statement-breakpoint
CREATE TABLE `goal_milestones` (
	`id` integer PRIMARY KEY NOT NULL,
	`goal_id` integer NOT NULL,
	`title` text NOT NULL,
	`due_date` text,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`target_date` text,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "goals_progress_chk" CHECK(progress_pct BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`color` text,
	`status` text DEFAULT 'active' NOT NULL,
	`start_date` text,
	`end_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_logs` (
	`id` integer PRIMARY KEY NOT NULL,
	`topic_id` integer,
	`subject_id` integer,
	`started_at` integer NOT NULL,
	`duration_min` integer NOT NULL,
	`notes_enc` blob,
	`notes_nonce` blob,
	`notes_tag` blob,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `exam_topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `exam_subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_deps` (
	`id` integer PRIMARY KEY NOT NULL,
	`task_id` integer NOT NULL,
	`blocks_task_id` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blocks_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_deps_pair_uq` ON `task_deps` (`task_id`,`blocks_task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY NOT NULL,
	`project_id` integer,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` integer DEFAULT 1 NOT NULL,
	`due_date` text,
	`start_date` text,
	`tags` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_status_chk" CHECK(status IN ('todo','doing','done')),
	CONSTRAINT "tasks_priority_chk" CHECK(priority BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_project` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY NOT NULL,
	`task_id` integer,
	`project_id` integer,
	`started_at` integer NOT NULL,
	`duration_sec` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
