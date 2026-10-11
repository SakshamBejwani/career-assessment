-- CreateTable
CREATE TABLE `students` (
    `id` VARCHAR(30) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `full_name` VARCHAR(120) NOT NULL,
    `whatsapp_e164` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `students_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consents` (
    `id` VARCHAR(30) NOT NULL,
    `student_id` VARCHAR(30) NOT NULL,
    `attempt_id` VARCHAR(30) NOT NULL,
    `purpose` VARCHAR(40) NOT NULL,
    `granted` BOOLEAN NOT NULL,
    `text_version` VARCHAR(40) NOT NULL,
    `granted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consents_attempt_id_idx`(`attempt_id`),
    INDEX `consents_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attempts` (
    `id` VARCHAR(30) NOT NULL,
    `public_ref` VARCHAR(16) NOT NULL,
    `student_id` VARCHAR(30) NOT NULL,
    `assessment_id` VARCHAR(40) NOT NULL,
    `assessment_version` VARCHAR(40) NOT NULL,
    `questionnaire_version` VARCHAR(40) NOT NULL,
    `scoring_version` VARCHAR(40) NOT NULL,
    `report_template_version` VARCHAR(40) NOT NULL,
    `interpretation_version` VARCHAR(40) NOT NULL,
    `approval_state` VARCHAR(20) NOT NULL,
    `status` VARCHAR(30) NOT NULL,
    `payment_workflow` VARCHAR(20) NOT NULL,
    `price_amount` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `access_token_hash` VARCHAR(64) NOT NULL,
    `contact_name` VARCHAR(120) NOT NULL,
    `contact_email` VARCHAR(254) NOT NULL,
    `contact_whatsapp` VARCHAR(20) NULL,
    `deliver_email` BOOLEAN NOT NULL DEFAULT true,
    `deliver_whatsapp` BOOLEAN NOT NULL DEFAULT false,
    `draft_answers` JSON NULL,
    `submission_key` VARCHAR(64) NULL,
    `responses_checksum` VARCHAR(64) NULL,
    `paid_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `submitted_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `failure_code` VARCHAR(60) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attempts_public_ref_key`(`public_ref`),
    UNIQUE INDEX `attempts_submission_key_key`(`submission_key`),
    INDEX `attempts_status_idx`(`status`),
    INDEX `attempts_created_at_idx`(`created_at`),
    INDEX `attempts_assessment_id_idx`(`assessment_id`),
    INDEX `attempts_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `responses` (
    `id` VARCHAR(30) NOT NULL,
    `attempt_id` VARCHAR(30) NOT NULL,
    `question_id` VARCHAR(40) NOT NULL,
    `answer` JSON NOT NULL,
    `answered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `responses_attempt_id_question_id_key`(`attempt_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `results` (
    `id` VARCHAR(30) NOT NULL,
    `attempt_id` VARCHAR(30) NOT NULL,
    `assessment_id` VARCHAR(40) NOT NULL,
    `scoring_version` VARCHAR(40) NOT NULL,
    `scores` JSON NOT NULL,
    `warnings` JSON NULL,
    `responses_checksum` VARCHAR(64) NOT NULL,
    `scored_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `results_attempt_id_key`(`attempt_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(30) NOT NULL,
    `attempt_id` VARCHAR(30) NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `provider_order_id` VARCHAR(64) NULL,
    `provider_payment_id` VARCHAR(64) NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `verified_at` DATETIME(3) NULL,
    `verification_source` VARCHAR(30) NULL,
    `failure_reason` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_provider_order_id_key`(`provider_order_id`),
    UNIQUE INDEX `payments_provider_payment_id_key`(`provider_payment_id`),
    INDEX `payments_attempt_id_idx`(`attempt_id`),
    INDEX `payments_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_events` (
    `id` VARCHAR(30) NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `event_id` VARCHAR(100) NOT NULL,
    `event_type` VARCHAR(60) NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    UNIQUE INDEX `payment_events_provider_event_id_key`(`provider`, `event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` VARCHAR(30) NOT NULL,
    `attempt_id` VARCHAR(30) NOT NULL,
    `result_id` VARCHAR(30) NOT NULL,
    `template_version` VARCHAR(40) NOT NULL,
    `interpretation_version` VARCHAR(40) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `storage_driver` VARCHAR(20) NULL,
    `storage_key` VARCHAR(255) NULL,
    `checksum` VARCHAR(64) NULL,
    `byte_size` INTEGER NULL,
    `generated_at` DATETIME(3) NULL,
    `error_code` VARCHAR(60) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reports_attempt_id_result_id_template_version_key`(`attempt_id`, `result_id`, `template_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_blobs` (
    `report_id` VARCHAR(30) NOT NULL,
    `data` LONGBLOB NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`report_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` VARCHAR(30) NOT NULL,
    `kind` VARCHAR(30) NOT NULL,
    `attempt_id` VARCHAR(30) NULL,
    `report_id` VARCHAR(30) NULL,
    `channel` VARCHAR(20) NULL,
    `purpose` VARCHAR(40) NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 5,
    `run_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `locked_until` DATETIME(3) NULL,
    `last_error_code` VARCHAR(60) NULL,
    `last_error` TEXT NULL,
    `provider_message_id` VARCHAR(191) NULL,
    `payload` JSON NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `jobs_dedupe_key_key`(`dedupe_key`),
    INDEX `jobs_status_run_at_idx`(`status`, `run_at`),
    INDEX `jobs_attempt_id_idx`(`attempt_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_events` (
    `id` VARCHAR(30) NOT NULL,
    `actor_type` VARCHAR(20) NOT NULL,
    `actor_id` VARCHAR(254) NULL,
    `event_type` VARCHAR(60) NOT NULL,
    `entity_type` VARCHAR(30) NOT NULL,
    `entity_id` VARCHAR(30) NOT NULL,
    `correlation_id` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_events_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_events_event_type_created_at_idx`(`event_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_limits` (
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `rate_limits_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `consents` ADD CONSTRAINT `consents_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consents` ADD CONSTRAINT `consents_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `responses` ADD CONSTRAINT `responses_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `results` ADD CONSTRAINT `results_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_result_id_fkey` FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_blobs` ADD CONSTRAINT `report_blobs_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
