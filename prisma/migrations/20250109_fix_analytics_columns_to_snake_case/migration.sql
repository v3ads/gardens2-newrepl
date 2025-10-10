
-- Fix analytics_master table column names
ALTER TABLE "analytics_master" RENAME COLUMN "snapshotDate" TO "snapshot_date";
ALTER TABLE "analytics_master" RENAME COLUMN "propertyId" TO "property_id";
ALTER TABLE "analytics_master" RENAME COLUMN "unitCode" TO "unit_code";
ALTER TABLE "analytics_master" RENAME COLUMN "bedspaceCode" TO "bedspace_code";
ALTER TABLE "analytics_master" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "analytics_master" RENAME COLUMN "leaseId" TO "lease_id";
ALTER TABLE "analytics_master" RENAME COLUMN "isOccupied" TO "is_occupied";
ALTER TABLE "analytics_master" RENAME COLUMN "studentFlag" TO "student_flag";
ALTER TABLE "analytics_master" RENAME COLUMN "primaryTenantFlag" TO "primary_tenant_flag";
ALTER TABLE "analytics_master" RENAME COLUMN "marketRent" TO "market_rent";
ALTER TABLE "analytics_master" RENAME COLUMN "daysVacant" TO "days_vacant";
ALTER TABLE "analytics_master" RENAME COLUMN "vacancyLoss" TO "vacancy_loss";
ALTER TABLE "analytics_master" RENAME COLUMN "moveIn" TO "move_in";
ALTER TABLE "analytics_master" RENAME COLUMN "moveOut" TO "move_out";
ALTER TABLE "analytics_master" RENAME COLUMN "leaseStart" TO "lease_start";
ALTER TABLE "analytics_master" RENAME COLUMN "leaseEnd" TO "lease_end";
ALTER TABLE "analytics_master" RENAME COLUMN "updatedAt" TO "updated_at";

-- Fix analytics_tenant_daily table column names
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "snapshotDate" TO "snapshot_date";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "propertyId" TO "property_id";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "unitCode" TO "unit_code";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "leaseId" TO "lease_id";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "isPrimary" TO "is_primary";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "cosignerFlag" TO "cosigner_flag";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "studentFlag" TO "student_flag";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "householdSize" TO "household_size";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "leaseLengthDays" TO "lease_length_days";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "tenureDays" TO "tenure_days";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "paymentPlanActive" TO "payment_plan_active";
ALTER TABLE "analytics_tenant_daily" RENAME COLUMN "updatedAt" TO "updated_at";

-- Fix occupancy_daily_kpi table column names
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "snapshotDate" TO "snapshot_date";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "totalUnits" TO "total_units";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "occupiedUnits" TO "occupied_units";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "vacantUnits" TO "vacant_units";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "occupancyRatePct" TO "occupancy_rate_pct";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "occupancyStudent" TO "occupancy_student";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "occupancyNonStudent" TO "occupancy_non_student";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "avgVacancyDays" TO "avg_vacancy_days";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "moveInsMTD" TO "move_ins_mtd";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "moveOutsMTD" TO "move_outs_mtd";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "expirations30" TO "expirations_30";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "expirations60" TO "expirations_60";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "expirations90" TO "expirations_90";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "calcVersion" TO "calc_version";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "computedAt" TO "computed_at";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "occupancy_daily_kpi" RENAME COLUMN "updatedAt" TO "updated_at";
