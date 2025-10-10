-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3');

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'LEVEL_1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."Feature" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RoleFeature" (
    "id" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "featureId" TEXT NOT NULL,
    "hasAccess" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoleFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailySyncStatus" (
    "id" TEXT NOT NULL DEFAULT 'sync_status_singleton',
    "lastSyncDate" TEXT,
    "lastSyncSuccess" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncDurationMs" INTEGER NOT NULL DEFAULT 0,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySyncStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_properties" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_appfolio_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_units" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_appfolio_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_leases" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_appfolio_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_tenants" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_appfolio_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_transactions" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_appfolio_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_work_orders" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_appfolio_work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_checkpoints" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "lastIngestedAt" TIMESTAMP(3),
    "lastSuccessfulRun" TIMESTAMP(3),
    "totalRecordsIngested" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resumeMetadata" TEXT,

    CONSTRAINT "report_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."integration_state" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "json" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analytics_meta" (
    "id" TEXT NOT NULL,
    "metaId" INTEGER NOT NULL,
    "lastSnapshotAt" TIMESTAMP(3),
    "totalRows" INTEGER,

    CONSTRAINT "analytics_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analytics_master" (
    "id" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "bedspaceCode" TEXT,
    "tenantId" TEXT,
    "leaseId" TEXT,
    "isOccupied" BOOLEAN NOT NULL,
    "studentFlag" BOOLEAN NOT NULL,
    "primaryTenantFlag" BOOLEAN,
    "marketRent" DOUBLE PRECISION,
    "mrr" DOUBLE PRECISION,
    "moveIn" DATE,
    "moveOut" DATE,
    "leaseStart" DATE,
    "leaseEnd" DATE,
    "daysVacant" INTEGER,
    "vacancyLoss" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analytics_tenant_daily" (
    "id" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "leaseId" TEXT,
    "tenantId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "cosignerFlag" BOOLEAN NOT NULL DEFAULT false,
    "studentFlag" BOOLEAN NOT NULL DEFAULT false,
    "householdSize" INTEGER,
    "leaseLengthDays" INTEGER,
    "tenureDays" INTEGER,
    "paymentPlanActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_tenant_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."master_tenant_data" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "unit_code" TEXT NOT NULL,
    "is_occupied" BOOLEAN NOT NULL,
    "mrr_amount" DOUBLE PRECISION,
    "market_rent" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_tenant_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."master_csv_data" (
    "id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "leaseStartDate" TEXT,
    "leaseEndDate" TEXT,
    "moveInDate" TEXT,
    "monthlyRent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marketRent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daysVacant" INTEGER NOT NULL DEFAULT 0,
    "securityDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tenantStatus" TEXT,
    "tenantType" TEXT,
    "primaryTenant" TEXT,
    "squareFeet" TEXT,
    "unitType" TEXT,
    "unitCategory" TEXT,
    "leasingAgent" TEXT,
    "nextRentIncrease" TEXT,
    "lastRentIncrease" TEXT,
    "syncDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_csv_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."kv_store" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kv_store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."occupancy_daily_kpi" (
    "id" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'portfolio',
    "totalUnits" INTEGER NOT NULL,
    "occupiedUnits" INTEGER NOT NULL,
    "vacantUnits" INTEGER NOT NULL,
    "occupancyRatePct" DOUBLE PRECISION NOT NULL,
    "occupancyStudent" DOUBLE PRECISION,
    "occupancyNonStudent" DOUBLE PRECISION,
    "avgVacancyDays" INTEGER,
    "moveInsMTD" INTEGER NOT NULL DEFAULT 0,
    "moveOutsMTD" INTEGER NOT NULL DEFAULT 0,
    "expirations30" INTEGER NOT NULL DEFAULT 0,
    "expirations60" INTEGER NOT NULL DEFAULT 0,
    "expirations90" INTEGER NOT NULL DEFAULT 0,
    "calcVersion" TEXT NOT NULL DEFAULT 'v1',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occupancy_daily_kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."unit_crosswalk" (
    "rawUnitText" TEXT NOT NULL,
    "unitCodeNorm" TEXT NOT NULL,
    "derivedVia" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_crosswalk_pkey" PRIMARY KEY ("rawUnitText")
);

-- CreateTable
CREATE TABLE "public"."job_locks" (
    "jobName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "processInfo" TEXT,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("jobName")
);

-- CreateTable
CREATE TABLE "public"."circuit_breaker_state" (
    "jobName" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "lastTimeoutAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "breakerOpenUntil" TIMESTAMP(3),
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "totalFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circuit_breaker_state_pkey" PRIMARY KEY ("jobName")
);

-- CreateTable
CREATE TABLE "public"."student_overrides" (
    "unitCode" TEXT NOT NULL,
    "isStudent" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_overrides_pkey" PRIMARY KEY ("unitCode")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_rent_roll" (
    "id" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_appfolio_rent_roll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_lease_history" (
    "id" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_appfolio_lease_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_lease_expiration_detail" (
    "id" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_appfolio_lease_expiration_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."raw_appfolio_unit_directory" (
    "id" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_appfolio_unit_directory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "public"."Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "public"."VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_key_key" ON "public"."Feature"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RoleFeature_role_featureId_key" ON "public"."RoleFeature"("role", "featureId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_appfolio_properties_sourceId_key" ON "public"."raw_appfolio_properties"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_appfolio_units_sourceId_key" ON "public"."raw_appfolio_units"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_appfolio_leases_sourceId_key" ON "public"."raw_appfolio_leases"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_appfolio_tenants_sourceId_key" ON "public"."raw_appfolio_tenants"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_appfolio_transactions_sourceId_key" ON "public"."raw_appfolio_transactions"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_appfolio_work_orders_sourceId_key" ON "public"."raw_appfolio_work_orders"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "report_checkpoints_reportId_key" ON "public"."report_checkpoints"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_state_key_key" ON "public"."integration_state"("key");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_meta_metaId_key" ON "public"."analytics_meta"("metaId");

-- CreateIndex
CREATE INDEX "analytics_master_snapshotDate_idx" ON "public"."analytics_master"("snapshotDate");

-- CreateIndex
CREATE INDEX "analytics_master_unitCode_idx" ON "public"."analytics_master"("unitCode");

-- CreateIndex
CREATE INDEX "analytics_master_isOccupied_snapshotDate_idx" ON "public"."analytics_master"("isOccupied", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_master_snapshotDate_unitCode_bedspaceCode_key" ON "public"."analytics_master"("snapshotDate", "unitCode", "bedspaceCode");

-- CreateIndex
CREATE INDEX "analytics_tenant_daily_snapshotDate_idx" ON "public"."analytics_tenant_daily"("snapshotDate");

-- CreateIndex
CREATE INDEX "analytics_tenant_daily_unitCode_snapshotDate_idx" ON "public"."analytics_tenant_daily"("unitCode", "snapshotDate");

-- CreateIndex
CREATE INDEX "analytics_tenant_daily_propertyId_snapshotDate_idx" ON "public"."analytics_tenant_daily"("propertyId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_tenant_daily_snapshotDate_tenantId_leaseId_key" ON "public"."analytics_tenant_daily"("snapshotDate", "tenantId", "leaseId");

-- CreateIndex
CREATE INDEX "master_tenant_data_snapshot_date_idx" ON "public"."master_tenant_data"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "master_tenant_data_snapshot_date_unit_code_key" ON "public"."master_tenant_data"("snapshot_date", "unit_code");

-- CreateIndex
CREATE UNIQUE INDEX "master_csv_data_unit_key" ON "public"."master_csv_data"("unit");

-- CreateIndex
CREATE UNIQUE INDEX "kv_store_key_key" ON "public"."kv_store"("key");

-- CreateIndex
CREATE INDEX "occupancy_daily_kpi_snapshotDate_idx" ON "public"."occupancy_daily_kpi"("snapshotDate");

-- CreateIndex
CREATE INDEX "occupancy_daily_kpi_scope_snapshotDate_idx" ON "public"."occupancy_daily_kpi"("scope", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "occupancy_daily_kpi_snapshotDate_scope_key" ON "public"."occupancy_daily_kpi"("snapshotDate", "scope");

-- CreateIndex
CREATE INDEX "unit_crosswalk_unitCodeNorm_idx" ON "public"."unit_crosswalk"("unitCodeNorm");

-- CreateIndex
CREATE INDEX "student_overrides_unitCode_idx" ON "public"."student_overrides"("unitCode");

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoleFeature" ADD CONSTRAINT "RoleFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "public"."Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
