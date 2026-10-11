-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "students" (
    "id" VARCHAR(30) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "whatsapp_e164" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" VARCHAR(30) NOT NULL,
    "student_id" VARCHAR(30) NOT NULL,
    "attempt_id" VARCHAR(30) NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "text_version" VARCHAR(40) NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" VARCHAR(30) NOT NULL,
    "public_ref" VARCHAR(16) NOT NULL,
    "student_id" VARCHAR(30) NOT NULL,
    "assessment_id" VARCHAR(40) NOT NULL,
    "assessment_version" VARCHAR(40) NOT NULL,
    "questionnaire_version" VARCHAR(40) NOT NULL,
    "scoring_version" VARCHAR(40) NOT NULL,
    "report_template_version" VARCHAR(40) NOT NULL,
    "interpretation_version" VARCHAR(40) NOT NULL,
    "approval_state" VARCHAR(20) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "payment_workflow" VARCHAR(20) NOT NULL,
    "price_amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "access_token_hash" VARCHAR(64) NOT NULL,
    "contact_name" VARCHAR(120) NOT NULL,
    "contact_email" VARCHAR(254) NOT NULL,
    "contact_whatsapp" VARCHAR(20),
    "deliver_email" BOOLEAN NOT NULL DEFAULT true,
    "deliver_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "draft_answers" JSONB,
    "submission_key" VARCHAR(64),
    "responses_checksum" VARCHAR(64),
    "paid_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" VARCHAR(30) NOT NULL,
    "attempt_id" VARCHAR(30) NOT NULL,
    "question_id" VARCHAR(40) NOT NULL,
    "answer" JSONB NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" VARCHAR(30) NOT NULL,
    "attempt_id" VARCHAR(30) NOT NULL,
    "assessment_id" VARCHAR(40) NOT NULL,
    "scoring_version" VARCHAR(40) NOT NULL,
    "scores" JSONB NOT NULL,
    "warnings" JSONB,
    "responses_checksum" VARCHAR(64) NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" VARCHAR(30) NOT NULL,
    "attempt_id" VARCHAR(30) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_order_id" VARCHAR(64),
    "provider_payment_id" VARCHAR(64),
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verification_source" VARCHAR(30),
    "failure_reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" VARCHAR(30) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "event_id" VARCHAR(100) NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" VARCHAR(30) NOT NULL,
    "attempt_id" VARCHAR(30) NOT NULL,
    "result_id" VARCHAR(30) NOT NULL,
    "template_version" VARCHAR(40) NOT NULL,
    "interpretation_version" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "storage_driver" VARCHAR(20),
    "storage_key" VARCHAR(255),
    "checksum" VARCHAR(64),
    "byte_size" INTEGER,
    "generated_at" TIMESTAMP(3),
    "error_code" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_blobs" (
    "report_id" VARCHAR(30) NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_blobs_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" VARCHAR(30) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "attempt_id" VARCHAR(30),
    "report_id" VARCHAR(30),
    "channel" VARCHAR(20),
    "purpose" VARCHAR(40),
    "dedupe_key" VARCHAR(191) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "last_error_code" VARCHAR(60),
    "last_error" TEXT,
    "provider_message_id" VARCHAR(191),
    "payload" JSONB,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" VARCHAR(30) NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_id" VARCHAR(254),
    "event_type" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" VARCHAR(30) NOT NULL,
    "correlation_id" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" VARCHAR(191) NOT NULL,
    "count" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");

-- CreateIndex
CREATE INDEX "consents_attempt_id_idx" ON "consents"("attempt_id");

-- CreateIndex
CREATE INDEX "consents_student_id_idx" ON "consents"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_public_ref_key" ON "attempts"("public_ref");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_submission_key_key" ON "attempts"("submission_key");

-- CreateIndex
CREATE INDEX "attempts_status_idx" ON "attempts"("status");

-- CreateIndex
CREATE INDEX "attempts_created_at_idx" ON "attempts"("created_at");

-- CreateIndex
CREATE INDEX "attempts_assessment_id_idx" ON "attempts"("assessment_id");

-- CreateIndex
CREATE INDEX "attempts_student_id_idx" ON "attempts"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "responses_attempt_id_question_id_key" ON "responses"("attempt_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_attempt_id_key" ON "results"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_order_id_key" ON "payments"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_attempt_id_idx" ON "payments"("attempt_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_attempt_id_result_id_template_version_key" ON "reports"("attempt_id", "result_id", "template_version");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupe_key_key" ON "jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "jobs_status_run_at_idx" ON "jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "jobs_attempt_id_idx" ON "jobs"("attempt_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_event_type_created_at_idx" ON "audit_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "rate_limits_expires_at_idx" ON "rate_limits"("expires_at");

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_blobs" ADD CONSTRAINT "report_blobs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
