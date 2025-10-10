# Overview

Cynthia Gardens Command Center is a modern property management application built with Next.js 14. It provides comprehensive analytics and operational tools for managing residential properties, with a focus on enterprise production readiness, reliability, zero daily operational maintenance, and high performance. Key features include task management, analytics dashboards, AI-powered chat assistance, and user management, all designed with a modular and toggleable architecture.

## Current Version

**v18.1.0** (Released: 2025-10-10)

### Recent Changes
- **v18.1.0** (2025-10-10): Fixed RentIQ occupancy calculation to match UnifiedAnalytics. Root cause: Unit 816 has status "Notice" (not "Current" or "Vacant"). RentIQ was only counting "Current" as occupied, while UnifiedAnalytics correctly counts anything NOT "Vacant" as occupied (including 'Notice', 'Future', etc.). Both systems now show: 140 occupied, 42 vacant, 76.92% occupancy, 33-unit RentIQ pool.
- **v18.0.0** (2025-10-10): Fixed RentIQ unit ordering and count logic. (1) Implemented proper sort order: units now ordered by HIGHEST vacancy days first (descending) for progressive discount prioritization. (2) Corrected total unit count: RentIQ now operates on all 182 units (family units 115, 116, 202, 313, 318 are always occupied and count toward total).
- **v17.0.0** (2025-10-10): Fixed critical RentIQ bugs causing incorrect pool calculations. Root causes: (1) Timezone mismatch - Prisma exact date match failed with Eastern-stored dates; implemented date range query. (2) Wrong data source - both daily-sync and API were using broken `rentiq-analytics-advanced.ts` that queried analytics_master with NULL market rents; switched to working `rentiq-analytics.ts` that uses master_csv_data. Results: Pool count fixed from 0 to 34 units, occupied units corrected from 166 to 139. Deprecated old file with warning.
- **v16.0.0** (2025-10-10): Fixed critical sync failures by implementing AppFolio duplicate record deduplication. Resolved constraint violations from duplicate `(unit_code, bedspace_code)` combinations. Sync now processes 5,372 records with zero errors.
- **v15.0.0** (Previous): Production deployment baseline
- **v14.0.0** (2025-09-29): Job queue & worker architecture perfection - eliminated polling recursion bug, fixed JobType enum mismatch, resolved parity monitor constraint violations

# User Preferences

Preferred communication style: Simple, everyday language.

**Production Deployment Protocol**: Always request explicit confirmation before making changes to deployed applications that would require redeployment. Explain the issue and proposed solution first, then let the user decide how to proceed.

# System Architecture

## UI/UX Decisions
The application uses Next.js 14 with App Router and TypeScript, employing a three-panel layout (top dashboard, collapsible left navigation, dynamic main content). It leverages React Server Components, shadcn/ui, Tailwind CSS, and Radix UI for accessible components. The design system supports light and dark themes with a futuristic green color scheme.

## Technical Implementations
The backend uses Next.js API routes for RESTful endpoints covering analytics, data ingestion, feature, and user management. It includes a robust, modular ETL pipeline for data ingestion from AppFolio V1 reports, creating analytical data marts, normalizing data, and pre-calculating KPIs. This pipeline features per-page checkpointing, crash recovery, resumable operations, and distributed locking for fault tolerance. A PostgreSQL-backed job queue system handles asynchronous tasks with durable job persistence, exponential backoff retries, and automatic deduplication, managed by a dedicated background worker. Authentication is managed by NextAuth.js (Auth.js) with Google OAuth, supporting multi-domain deployment and role-based access control (ADMIN, LEVEL_1, LEVEL_2, LEVEL_3). Form validation is handled by React Hook Form and Zod.

## System Design Choices
- **Deployment**: The system operates on a Replit Reserved VM with a concurrent process architecture for the Next.js frontend and a dedicated background worker.
- **Database**: A dual-database approach is used: Neon-hosted PostgreSQL for application data, KPIs, and sync management (managed by Prisma), and Better-SQLite3 for raw report storage and high-performance data processing. Both Drizzle schema (`shared/schema.ts`) and Prisma schema (`prisma/schema.prisma`) are utilized, with Prisma being the authoritative source. Schema changes are managed via migrations (`npm run db:push`), and `prisma db pull` is prohibited on production.
- **Job Queue**: A PostgreSQL-backed durable job queue uses `SKIP LOCKED` for concurrency with a 5-second polling interval. Jobs follow a QUEUED → RUNNING → SUCCEEDED/FAILED lifecycle, with automatic retry and deduplication. Failed sync jobs trigger automated email notifications.
- **Critical Reliability Fixes**: Implemented solutions for transaction timeouts in analytics, prevention of "zombie" sync locks, elimination of worker polling recursion bugs, ghost lock detection via PID-based orphan cleanup, and defensive date validation for corrupt AppFolio data.
- **Ghost Lock Prevention**: Three-layer defense system prevents orphaned locks from dead workers (graceful shutdown cleanup, startup orphan detection via `process.kill(pid, 0)` health checks, and acquisition-time validation). See `OPERATIONS_RUNBOOK.md` for operational procedures.
- **Data Quality**: Invalid dates from AppFolio are handled defensively with structured telemetry logging. EasternTimeManager returns null for corrupt dates instead of throwing RangeError, with analytics code handling null gracefully.

# External Dependencies

- **Next.js 14+**: Application framework
- **NextAuth.js**: Authentication and session management
- **Prisma**: PostgreSQL ORM
- **OpenAI**: AI assistant and NLP
- **AppFolio V1 API**: Property management data source
- **Tailwind CSS + shadcn/ui**: UI framework
- **Radix UI**: Accessible component primitives
- **Better-SQLite3**: High-performance SQLite driver
- **React Hook Form + Zod**: Form validation
- **Lucide React**: Icon library
- **Next Themes**: Theme management