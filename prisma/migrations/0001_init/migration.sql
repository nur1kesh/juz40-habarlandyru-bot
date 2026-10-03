-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('received', 'processing', 'approved', 'rejected', 'needs_review', 'publishing', 'published', 'cancelled', 'error', 'publish_failed');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "awaiting_edit_submission_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'received',
    "original_text" TEXT NOT NULL,
    "cleaned_text" TEXT,
    "category" TEXT,
    "ai_status" TEXT,
    "ai_confidence" DOUBLE PRECISION,
    "ai_reason" TEXT,
    "ai_warnings" JSONB,
    "missing_information" JSONB,
    "ai_raw_response" JSONB,
    "photo_file_id" TEXT,
    "text_hash" TEXT NOT NULL,
    "parent_id" INTEGER,
    "published_message_id" INTEGER,
    "admin_message_id" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "submissions_user_id_created_at_idx" ON "submissions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "submissions_text_hash_idx" ON "submissions"("text_hash");

-- CreateIndex
CREATE INDEX "submissions_status_updated_at_idx" ON "submissions"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

