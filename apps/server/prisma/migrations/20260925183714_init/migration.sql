-- CreateEnum
CREATE TYPE "role" AS ENUM ('STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "token_type" AS ENUM ('SLOT', 'LIVE', 'KIOSK');

-- CreateEnum
CREATE TYPE "priority" AS ENUM ('NONE', 'ELDERLY', 'PREGNANT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "token_status" AS ENUM ('WAITING', 'CALLED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "queue_action" AS ENUM ('CREATED', 'CALLED', 'SKIPPED', 'NO_SHOW', 'COMPLETED', 'CANCELLED', 'NOTIFIED_THREE_AWAY');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('PATIENT', 'STAFF', 'ADMIN', 'KIOSK', 'SYSTEM', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('TOKEN_CREATED', 'THREE_AWAY', 'CALLED', 'SKIPPED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'SMS_SIMULATED', 'SMS_TWILIO');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(60) NOT NULL,
    "code" VARCHAR(4) NOT NULL,
    "avg_consult_min" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "department_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "room" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "avg_consult_min" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doctor_id" UUID NOT NULL,
    "service_date" DATE NOT NULL,
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ NOT NULL,
    "capacity" SMALLINT NOT NULL DEFAULT 3,
    "booked_count" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(10),
    "name" VARCHAR(80),
    "age" SMALLINT,
    "gender" "gender",
    "consent_at" TIMESTAMPTZ,
    "is_walk_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(10) NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(40) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "role" "role" NOT NULL DEFAULT 'STAFF',
    "doctor_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "slot_id" UUID,
    "service_date" DATE NOT NULL,
    "token_seq" INTEGER NOT NULL,
    "token_no" VARCHAR(12) NOT NULL,
    "type" "token_type" NOT NULL,
    "priority" "priority" NOT NULL DEFAULT 'NONE',
    "status" "token_status" NOT NULL DEFAULT 'WAITING',
    "sort_key" BIGINT NOT NULL,
    "slot_time" TIMESTAMPTZ,
    "skip_count" SMALLINT NOT NULL DEFAULT 0,
    "notified_three_away" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "called_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dept_daily_counters" (
    "department_id" UUID NOT NULL,
    "service_date" DATE NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dept_daily_counters_pkey" PRIMARY KEY ("department_id","service_date")
);

-- CreateTable
CREATE TABLE "queue_events" (
    "id" BIGSERIAL NOT NULL,
    "token_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "action" "queue_action" NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_id" UUID NOT NULL,
    "patient_id" UUID,
    "kind" "notification_kind" NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "to_phone_masked" VARCHAR(12),
    "message" TEXT NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'SENT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "doctors_department_id_is_active_idx" ON "doctors"("department_id", "is_active");

-- CreateIndex
CREATE INDEX "slots_doctor_id_service_date_idx" ON "slots"("doctor_id", "service_date");

-- CreateIndex
CREATE UNIQUE INDEX "slots_doctor_id_start_time_key" ON "slots"("doctor_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "patients_phone_key" ON "patients"("phone");

-- CreateIndex
CREATE INDEX "otp_requests_phone_created_at_idx" ON "otp_requests"("phone", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "staff_username_key" ON "staff"("username");

-- CreateIndex
CREATE UNIQUE INDEX "staff_doctor_id_key" ON "staff"("doctor_id");

-- CreateIndex
CREATE INDEX "tokens_doctor_id_status_sort_key_created_at_id_idx" ON "tokens"("doctor_id", "status", "sort_key", "created_at", "id");

-- CreateIndex
CREATE INDEX "tokens_department_id_service_date_status_idx" ON "tokens"("department_id", "service_date", "status");

-- CreateIndex
CREATE INDEX "tokens_patient_id_service_date_idx" ON "tokens"("patient_id", "service_date");

-- CreateIndex
CREATE INDEX "tokens_service_date_status_idx" ON "tokens"("service_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_department_id_service_date_token_seq_key" ON "tokens"("department_id", "service_date", "token_seq");

-- CreateIndex
CREATE INDEX "queue_events_token_id_idx" ON "queue_events"("token_id");

-- CreateIndex
CREATE INDEX "queue_events_department_id_created_at_idx" ON "queue_events"("department_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_token_id_idx" ON "notifications"("token_id");

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dept_daily_counters" ADD CONSTRAINT "dept_daily_counters_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── RAW SQL — DATABASE_SCHEMA §5 ──────────────────────────────────────────────
-- Partial unique indexes (cannot be expressed in Prisma schema DSL)

-- Prevents two staff tabs calling "next" simultaneously for the same doctor
CREATE UNIQUE INDEX "uq_one_called_per_doctor"
  ON "tokens" ("doctor_id")
  WHERE status = 'CALLED';

-- Prevents a patient from having two active tokens in the same dept on the same day
CREATE UNIQUE INDEX "uq_one_active_per_patient_dept_day"
  ON "tokens" ("patient_id", "department_id", "service_date")
  WHERE status IN ('WAITING', 'CALLED');

-- ─── CHECK constraints (raw SQL) ─────────────────────────────────────────────

-- SLOT tokens must reference a slot
ALTER TABLE "tokens"
  ADD CONSTRAINT "chk_slot_token_has_slot_id"
  CHECK (type <> 'SLOT' OR slot_id IS NOT NULL);

-- booked_count must stay within 0..capacity
ALTER TABLE "slots"
  ADD CONSTRAINT "chk_booked_count_range"
  CHECK (booked_count BETWEEN 0 AND capacity);

-- age must be 0–120 when provided
ALTER TABLE "patients"
  ADD CONSTRAINT "chk_patient_age_range"
  CHECK (age IS NULL OR age BETWEEN 0 AND 120);
