import { pgTable, varchar, integer, text, boolean, timestamp, pgEnum, real, unique, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Enums (MUST match database and Prisma schema exactly - UPPERCASE values)
export const roleEnum = pgEnum('Role', ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']);
export const jobStatusEnum = pgEnum('JobStatus', ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']);
export const jobTypeEnum = pgEnum('JobType', ['DAILY_SYNC', 'WEBHOOK_SYNC', 'MANUAL_SYNC', 'EMAIL_SEND', 'DATA_CLEANUP']);

// Tables
export const account = pgTable('Account', {
  id: varchar('id').primaryKey(),
  userId: varchar('userId').notNull(),
  type: varchar('type').notNull(),
  provider: varchar('provider').notNull(),
  providerAccountId: varchar('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: varchar('token_type'),
  scope: varchar('scope'),
  id_token: text('id_token'),
  session_state: varchar('session_state'),
});

export const session = pgTable('Session', {
  id: varchar('id').primaryKey(),
  sessionToken: varchar('sessionToken').notNull().unique(),
  userId: varchar('userId').notNull(),
  expires: timestamp('expires').notNull(),
});

export const user = pgTable('User', {
  id: varchar('id').primaryKey(),
  name: varchar('name'),
  email: varchar('email').unique(),
  emailVerified: timestamp('emailVerified'),
  image: varchar('image'),
  role: roleEnum('role').default('LEVEL_1').notNull(),
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
});

export const verificationToken = pgTable('VerificationToken', {
  identifier: varchar('identifier').notNull(),
  token: varchar('token').notNull().unique(),
  expires: timestamp('expires').notNull(),
});

export const feature = pgTable('Feature', {
  id: varchar('id').primaryKey(),
  key: varchar('key').notNull().unique(),
  name: varchar('name').notNull(),
  description: varchar('description').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  sortOrder: integer('sortOrder').default(0).notNull(),
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
});

export const roleFeature = pgTable('RoleFeature', {
  id: varchar('id').primaryKey(),
  role: roleEnum('role').notNull(),
  featureId: varchar('featureId').notNull(),
  hasAccess: boolean('hasAccess').default(false).notNull(),
});

export const task = pgTable('Task', {
  id: varchar('id').primaryKey(),
  userId: varchar('userId').notNull(),
  title: varchar('title').notNull(),
  done: boolean('done').default(false).notNull(),
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
});

export const userPreferences = pgTable('UserPreferences', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('userId').notNull().unique(),
  navigationOrder: text('navigationOrder'), // JSON array of feature keys in order
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
});

// Daily sync status tracking
export const dailySyncStatus = pgTable('DailySyncStatus', {
  id: varchar('id').primaryKey(),
  lastSyncDate: varchar('lastSyncDate'),
  lastSyncSuccess: boolean('lastSyncSuccess').default(false).notNull(),
  lastSyncDurationMs: integer('lastSyncDurationMs').default(0).notNull(),
  totalRecords: integer('totalRecords').default(0).notNull(),
  errorMessage: text('errorMessage'),
  lastSuccessfulSyncDate: varchar('lastSuccessfulSyncDate'), // Track last known good sync
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
});

// Job Queue Architecture - Durable background job processing
export const jobQueue = pgTable('job_queue', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  type: jobTypeEnum('type').notNull(),
  payload: text('payload'), // JSONB stored as text for compatibility
  status: jobStatusEnum('status').default('QUEUED').notNull(),
  priority: integer('priority').default(0).notNull(),
  runAt: timestamp('run_at').default(sql`now()`).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  dedupeKey: varchar('dedupe_key').unique(), // For preventing duplicate jobs
  lastError: text('last_error'),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`).notNull(),
}, (table) => {
  return {
    statusRunAtIdx: index('job_queue_status_run_at_idx').on(table.status, table.runAt, table.priority),
    dedupeKeyIdx: index('job_queue_dedupe_key_idx').on(table.dedupeKey),
    typeIdx: index('job_queue_type_idx').on(table.type),
  }
});

export const jobRuns = pgTable('job_runs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar('job_id').notNull(),
  workerId: varchar('worker_id').notNull(),
  startedAt: timestamp('started_at').default(sql`now()`).notNull(),
  heartbeatAt: timestamp('heartbeat_at').default(sql`now()`),
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
  success: boolean('success'),
  error: text('error'),
  retryOfJobId: varchar('retry_of_job_id'), // References another job_queue.id
  logs: text('logs'), // JSONB stored as text
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
}, (table) => {
  return {
    jobIdIdx: index('job_runs_job_id_idx').on(table.jobId),
    startedAtIdx: index('job_runs_started_at_idx').on(table.startedAt),
    workerIdIdx: index('job_runs_worker_id_idx').on(table.workerId),
  }
});

// Distributed sync locking to prevent multiple sync operations with progress tracking
// Updated schema to match architect specifications (no runtime DDL)
export const syncLock = pgTable('sync_locks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  owner: text('owner').notNull(),
  acquiredAt: timestamp('acquired_at').default(sql`now()`).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  currentProgress: text('current_progress'),
  currentStep: integer('current_step'),
  totalSteps: integer('total_steps'),
  syncType: jobTypeEnum('sync_type'),
  startedAt: timestamp('started_at'),
  cancelRequested: boolean('cancel_requested').default(false).notNull(),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`).notNull(),
}, (table) => {
  return {
    ownerIdx: index('sync_locks_owner_idx').on(table.owner),
    expiresAtIdx: index('sync_locks_expires_at_idx').on(table.expiresAt),
  }
});

// Pre-calculated occupancy KPI data mart - computed during autosync
export const occupancyDailyKPI = pgTable('occupancy_daily_kpi', {
  id: varchar('id').primaryKey(),
  snapshotDate: varchar('snapshotDate').notNull(), // YYYY-MM-DD format for consistency
  scope: varchar('scope').notNull().default('portfolio'), // portfolio or property_id
  totalUnits: integer('totalUnits').notNull(),
  occupiedUnits: integer('occupiedUnits').notNull(),
  vacantUnits: integer('vacantUnits').notNull(),
  occupancyRatePct: real('occupancyRatePct').notNull(), // Overall occupancy percentage
  occupancyStudent: real('occupancyStudent'), // Student housing occupancy %
  occupancyNonStudent: real('occupancyNonStudent'), // Non-student housing occupancy %
  avgVacancyDays: integer('avgVacancyDays'), // Average vacancy days
  moveInsMTD: integer('moveInsMTD').default(0).notNull(), // Move-ins month-to-date
  moveOutsMTD: integer('moveOutsMTD').default(0).notNull(), // Move-outs month-to-date
  expirations30: integer('expirations30').default(0).notNull(), // Expirations in 30 days
  expirations60: integer('expirations60').default(0).notNull(), // Expirations in 60 days
  expirations90: integer('expirations90').default(0).notNull(), // Expirations in 90 days
  calcVersion: varchar('calcVersion').default('v1'), // Calculation version for compatibility
  computedAt: timestamp('computedAt').default(sql`now()`).notNull(),
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
}, (table) => {
  return {
    // Unique constraint on date + scope for upsert operations
    uniq: unique().on(table.snapshotDate, table.scope),
    // Index for fast lookups by date
    snapshotDateIdx: index('occupancy_kpi_snapshot_date_idx').on(table.snapshotDate),
  }
});

// Operational Efficiency Tables

// Lease history for turnover calculations
export const leaseHistory = pgTable('LeaseHistory', {
  id: varchar('id').primaryKey(),
  unit: varchar('unit').notNull(),
  tenantName: varchar('tenantName'),
  leaseStartDate: varchar('leaseStartDate'), // YYYY-MM-DD
  leaseEndDate: varchar('leaseEndDate'), // YYYY-MM-DD
  moveInDate: varchar('moveInDate'), // YYYY-MM-DD
  moveOutDate: varchar('moveOutDate'), // YYYY-MM-DD
  noticeDate: varchar('noticeDate'), // YYYY-MM-DD - when notice was given
  actualMoveOut: varchar('actualMoveOut'), // YYYY-MM-DD - actual move out
  monthlyRent: real('monthlyRent'),
  leaseType: varchar('leaseType'), // New, Renewal, Transfer
  reasonForLeaving: varchar('reasonForLeaving'),
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
}, (table) => {
  return {
    unitIdx: index('lease_history_unit_idx').on(table.unit),
    dateIdx: index('lease_history_date_idx').on(table.moveOutDate),
  }
});

// Unit turn tracking for make-ready cycle analysis
export const unitTurnDetail = pgTable('UnitTurnDetail', {
  id: varchar('id').primaryKey(),
  unit: varchar('unit').notNull(),
  turnStartDate: varchar('turnStartDate'), // YYYY-MM-DD - when unit became vacant
  moveOutDate: varchar('moveOutDate'), // YYYY-MM-DD
  inspectionDate: varchar('inspectionDate'), // YYYY-MM-DD
  makeReadyStartDate: varchar('makeReadyStartDate'), // YYYY-MM-DD
  makeReadyCompleteDate: varchar('makeReadyCompleteDate'), // YYYY-MM-DD
  readyDate: varchar('readyDate'), // YYYY-MM-DD - ready for showing
  marketedDate: varchar('marketedDate'), // YYYY-MM-DD - listed for rent
  applicationDate: varchar('applicationDate'), // YYYY-MM-DD - first application
  leaseSignedDate: varchar('leaseSignedDate'), // YYYY-MM-DD
  nextMoveInDate: varchar('nextMoveInDate'), // YYYY-MM-DD
  totalMakeReadyDays: integer('totalMakeReadyDays'),
  totalDownDays: integer('totalDownDays'), // Total days from vacant to occupied
  turnCost: real('turnCost'), // Total turn cost
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
}, (table) => {
  return {
    unitIdx: index('unit_turn_unit_idx').on(table.unit),
    dateIdx: index('unit_turn_date_idx').on(table.turnStartDate),
  }
});

// Unit vacancy tracking for lease-up analysis
export const unitVacancy = pgTable('UnitVacancy', {
  id: varchar('id').primaryKey(),
  unit: varchar('unit').notNull(),
  vacancyStartDate: varchar('vacancyStartDate'), // YYYY-MM-DD
  vacancyEndDate: varchar('vacancyEndDate'), // YYYY-MM-DD - null if still vacant
  readyDate: varchar('readyDate'), // YYYY-MM-DD - ready for showing
  marketedDate: varchar('marketedDate'), // YYYY-MM-DD - actively marketed
  applicationDate: varchar('applicationDate'), // YYYY-MM-DD - first application received
  leaseStartDate: varchar('leaseStartDate'), // YYYY-MM-DD - lease started
  vacancyReason: varchar('vacancyReason'), // Move-out, Eviction, Transfer
  daysVacant: integer('daysVacant'),
  daysToLease: integer('daysToLease'), // Days from ready to lease signed
  marketRent: real('marketRent'),
  finalRent: real('finalRent'), // Actually leased rent
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
}, (table) => {
  return {
    unitIdx: index('unit_vacancy_unit_idx').on(table.unit),
    dateIdx: index('unit_vacancy_date_idx').on(table.vacancyStartDate),
  }
});

// Work order tracking for maintenance metrics
export const workOrder = pgTable('WorkOrder', {
  id: varchar('id').primaryKey(),
  workOrderNumber: varchar('workOrderNumber').unique(),
  unit: varchar('unit'),
  propertyId: varchar('propertyId'),
  category: varchar('category'), // Maintenance, Make-Ready, Preventive, Emergency
  subcategory: varchar('subcategory'),
  description: text('description'),
  priority: varchar('priority'), // Low, Medium, High, Emergency
  status: varchar('status'), // Open, In Progress, Completed, Cancelled
  requestedBy: varchar('requestedBy'),
  assignedTo: varchar('assignedTo'),
  openedAt: timestamp('openedAt').notNull(),
  assignedAt: timestamp('assignedAt'),
  startedAt: timestamp('startedAt'),
  completedAt: timestamp('completedAt'),
  closedAt: timestamp('closedAt'),
  totalCost: real('totalCost'),
  laborHours: real('laborHours'),
  isEmergency: boolean('isEmergency').default(false),
  isPreventive: boolean('isPreventive').default(false),
  isReopen: boolean('isReopen').default(false), // If this WO was reopened
  originalWOId: varchar('originalWOId'), // Reference to original WO if this is a reopen
  slaDays: integer('slaDays'), // SLA target in days
  actualDays: integer('actualDays'), // Actual completion days
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
}, (table) => {
  return {
    unitIdx: index('work_order_unit_idx').on(table.unit),
    statusIdx: index('work_order_status_idx').on(table.status),
    dateIdx: index('work_order_date_idx').on(table.openedAt),
    categoryIdx: index('work_order_category_idx').on(table.category),
  }
});

// General ledger for turn cost analysis
export const generalLedger = pgTable('GeneralLedger', {
  id: varchar('id').primaryKey(),
  transactionId: varchar('transactionId'),
  date: varchar('date'), // YYYY-MM-DD
  account: varchar('account').notNull(),
  accountCode: varchar('accountCode'),
  description: text('description'),
  amount: real('amount').notNull(),
  unit: varchar('unit'), // Associated unit if applicable
  propertyId: varchar('propertyId'),
  vendor: varchar('vendor'),
  category: varchar('category'), // Make-Ready, Maintenance, Turnover, etc
  subcategory: varchar('subcategory'),
  workOrderId: varchar('workOrderId'), // Link to work order if applicable
  isCapex: boolean('isCapex').default(false),
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
}, (table) => {
  return {
    accountIdx: index('general_ledger_account_idx').on(table.account),
    unitIdx: index('general_ledger_unit_idx').on(table.unit),
    dateIdx: index('general_ledger_date_idx').on(table.date),
    categoryIdx: index('general_ledger_category_idx').on(table.category),
  }
});

// Parity monitoring table for Phase 1 validation tracking
export const parityValidation = pgTable('ParityValidation', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp('timestamp').default(sql`now()`).notNull(),
  optimizedDuration: integer('optimizedDuration').notNull(), // seconds
  optimizedRecords: integer('optimizedRecords').notNull(),
  legacyDuration: integer('legacyDuration').notNull(), // estimated seconds
  legacyRecords: integer('legacyRecords').notNull(), // estimated records
  performanceImprovement: real('performanceImprovement').notNull(), // multiplier (87x = 87.0)
  maxKpiVariance: real('maxKpiVariance').notNull(), // percentage (0.5% = 0.5)
  passedThreshold: boolean('passedThreshold').notNull(),
  alertCount: integer('alertCount').default(0).notNull(),
  alerts: text('alerts'), // JSON array of alert messages
  optimizedKpis: text('optimizedKpis').notNull(), // JSON object of KPI values
  legacyKpis: text('legacyKpis').notNull(), // JSON object of KPI values
  variance: text('variance').notNull(), // JSON object of variance calculations
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
}, (table) => ({
  timestampIdx: index('parity_validation_timestamp_idx').on(table.timestamp),
  passedThresholdIdx: index('parity_validation_passed_threshold_idx').on(table.passedThreshold),
  maxKpiVarianceIdx: index('parity_validation_max_kpi_variance_idx').on(table.maxKpiVariance),
}));

// Relations
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const userRelations = relations(user, ({ many, one }) => ({
  accounts: many(account),
  sessions: many(session),
  tasks: many(task),
  preferences: one(userPreferences),
}));

export const featureRelations = relations(feature, ({ many }) => ({
  roleFeatures: many(roleFeature),
}));

export const roleFeatureRelations = relations(roleFeature, ({ one }) => ({
  feature: one(feature, {
    fields: [roleFeature.featureId],
    references: [feature.id],
  }),
}));

export const taskRelations = relations(task, ({ one }) => ({
  user: one(user, {
    fields: [task.userId],
    references: [user.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(user, {
    fields: [userPreferences.userId],
    references: [user.id],
  }),
}));

// Detailed Sync Tracking Tables for Stage-by-Stage Reporting
export const syncRuns = pgTable('sync_runs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  type: varchar('type').notNull(), // 'daily_auto', 'manual', 'recovery'
  status: varchar('status').notNull(), // 'running', 'completed', 'failed', 'cancelled'
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  durationMs: integer('duration_ms'),
  totalRecords: integer('total_records').default(0),
  initiatedBy: varchar('initiated_by'), // 'cron', 'admin_user', 'auto_recovery'
  errorSummary: text('error_summary'),
  validationsPassed: integer('validations_passed').default(0),
  validationsFailed: integer('validations_failed').default(0),
  isOptimized: boolean('is_optimized').default(false),
  warningsCount: integer('warnings_count').default(0),
  lockOwner: varchar('lock_owner'),
  environment: varchar('environment').default('production'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const syncSteps = pgTable('sync_steps', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar('run_id').notNull().references(() => syncRuns.id, { onDelete: 'cascade' }),
  name: varchar('name').notNull(), // 'appfolio.connect', 'raw.insert.rent_roll', 'analytics.occupancy'
  category: varchar('category').notNull(), // 'ingestion', 'processing', 'validation'
  status: varchar('status').notNull(), // 'pending', 'running', 'completed', 'failed', 'skipped'
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  durationMs: integer('duration_ms'),
  recordsProcessed: integer('records_processed').default(0),
  metrics: text('metrics'), // JSON string: { pages: 5, api_calls: 12, db_inserts: 1250 }
  details: text('details'), // JSON string: { source_table: 'rent_roll', target_rows: 182 }
  error: text('error'), // JSON string: { code: 'API_TIMEOUT', message: '...', remediation: 'Check API connectivity' }
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const syncRunsRelations = relations(syncRuns, ({ many }) => ({
  steps: many(syncSteps),
}));

export const syncStepsRelations = relations(syncSteps, ({ one }) => ({
  run: one(syncRuns, {
    fields: [syncSteps.runId],
    references: [syncRuns.id],
  }),
}));

// Email retry queue for failed email notifications
export const emailRetryQueue = pgTable('email_retry_queue', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  emailType: varchar('emailType').notNull(), // 'master_csv_update', 'failure_notification', etc.
  recipientEmail: varchar('recipientEmail').notNull(),
  subject: text('subject').notNull(),
  htmlContent: text('htmlContent').notNull(),
  textContent: text('textContent').notNull(),
  attachmentData: text('attachmentData'), // JSON string of attachment data
  retryCount: integer('retryCount').default(0).notNull(),
  maxRetries: integer('maxRetries').default(3).notNull(),
  nextRetryAt: timestamp('nextRetryAt').notNull(),
  lastError: text('lastError'),
  status: varchar('status').default('pending').notNull(), // 'pending', 'processing', 'success', 'failed'
  createdAt: timestamp('createdAt').default(sql`now()`).notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
});

// Key-Value Store for simple caching and configuration storage
export const kvStore = pgTable('kv_store', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  key: varchar('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: timestamp('updatedAt').default(sql`now()`).notNull(),
});