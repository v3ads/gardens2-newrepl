-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."JobType" AS ENUM ('DAILY_SYNC', 'WEBHOOK_SYNC', 'MANUAL_SYNC');

-- AlterTable
ALTER TABLE "public"."report_checkpoints" ADD COLUMN     "deltaRecordsSkipped" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSeenId" TEXT,
ADD COLUMN     "lastSeenUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "navigationOrder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analytics_master_temp" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "property_id" TEXT NOT NULL,
    "unit_code" TEXT NOT NULL,
    "unit_code_norm" TEXT,
    "bedspace_code" TEXT,
    "lease_id" TEXT,
    "tenant_id" TEXT,
    "is_occupied" INTEGER NOT NULL,
    "occupancy_source" TEXT,
    "student_flag" INTEGER NOT NULL,
    "student_flag_source" TEXT,
    "primary_tenant_flag" INTEGER,
    "market_rent" DOUBLE PRECISION,
    "mrr" DOUBLE PRECISION,
    "move_in" DATE,
    "move_out" DATE,
    "lease_start" DATE,
    "lease_end" DATE,
    "days_vacant" INTEGER,
    "vacancy_loss" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_master_temp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."job_queue" (
    "id" TEXT NOT NULL,
    "type" "public"."JobType" NOT NULL,
    "payload" TEXT,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "dedupe_key" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."job_runs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeat_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "success" BOOLEAN,
    "error" TEXT,
    "retry_of_job_id" TEXT,
    "logs" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sync_locks" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "acquired_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "current_progress" TEXT,
    "current_step" INTEGER,
    "sync_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "public"."UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "analytics_master_temp_snapshot_date_idx" ON "public"."analytics_master_temp"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_master_temp_snapshot_date_unit_code_bedspace_code_key" ON "public"."analytics_master_temp"("snapshot_date", "unit_code", "bedspace_code");

-- CreateIndex
CREATE UNIQUE INDEX "job_queue_dedupe_key_key" ON "public"."job_queue"("dedupe_key");

-- CreateIndex
CREATE INDEX "job_queue_status_run_at_priority_idx" ON "public"."job_queue"("status", "run_at", "priority");

-- CreateIndex
CREATE INDEX "job_queue_dedupe_key_idx" ON "public"."job_queue"("dedupe_key");

-- CreateIndex
CREATE INDEX "job_queue_type_idx" ON "public"."job_queue"("type");

-- CreateIndex
CREATE INDEX "job_runs_job_id_idx" ON "public"."job_runs"("job_id");

-- CreateIndex
CREATE INDEX "job_runs_started_at_idx" ON "public"."job_runs"("started_at");

-- CreateIndex
CREATE INDEX "job_runs_worker_id_idx" ON "public"."job_runs"("worker_id");

-- AddForeignKey
ALTER TABLE "public"."UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."job_runs" ADD CONSTRAINT "job_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."job_queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
