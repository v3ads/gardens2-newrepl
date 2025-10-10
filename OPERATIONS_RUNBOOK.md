# Cynthia Gardens Command Center - Operations Runbook

## Ghost Lock Detection & Recovery

### Overview
The sync system uses a distributed locking mechanism to prevent concurrent syncs. To handle scenarios where worker processes crash or are forcefully terminated, a multi-layered ghost lock detection system prevents orphaned locks from blocking future syncs.

### How It Works

#### Lock Ownership Format
Sync locks use a specific owner format: `process-{PID}-{timestamp}-{random}`
- **PID**: The process ID of the worker that acquired the lock
- **timestamp**: Unix timestamp when the worker started
- **random**: Random string for uniqueness

Example: `process-17788-1760091748832-abc123def`

#### Three-Layer Defense System

**Layer 1: Worker Graceful Shutdown**
- When a worker receives SIGTERM, SIGINT, or SIGHUP signals, it explicitly releases all sync locks
- This handles normal shutdown scenarios (deployments, restarts, manual stops)
- Code location: `worker/sync-worker.ts`

**Layer 2: Startup Orphan Detection**
- When a worker starts, it checks for existing sync locks
- Extracts the PID from the lock owner string
- Uses `process.kill(pid, 0)` to check if the owning process is alive
- If the process is dead (ESRCH error), the lock is force-deleted
- This handles crashes, force-kills, and system reboots
- Code location: `lib/sync-maintenance-service.ts`

**Layer 3: Acquisition-Time Validation**
- Before attempting to acquire a lock, the sync manager checks if an existing lock owner is alive
- If the owner process is dead, it cleans up the orphaned lock before proceeding
- This is the "last line of defense" if startup cleanup missed the lock
- Code location: `lib/daily-sync-manager.ts`

### Process Health Check Details

**How We Check if a Process is Alive:**
```javascript
process.kill(pid, 0)  // Signal 0 doesn't kill, just checks existence
```

**Return Values:**
- Success: Process exists and is alive
- ESRCH error: No such process (dead/never existed)
- EPERM error: Process exists but we lack permissions (treated as alive)

### System Assumptions & Limitations

**Critical Assumptions:**
1. **Single-Host Deployment**: All workers run on the same machine
   - PID checks only work for local processes
   - Multi-host deployments would require different orphan detection logic

2. **PID Uniqueness**: Process IDs are unique within the system's current boot cycle
   - PIDs may be reused after system reboot
   - The timestamp component in lock owner provides additional uniqueness

3. **Signal Permission**: Workers can send signal 0 to check other processes
   - Requires appropriate system permissions
   - Usually works when all workers run under the same user

**Known Limitations:**
- Cannot detect zombie processes (defunct but not yet reaped)
- PID exhaustion could theoretically cause false positives
- Cross-container/cross-VM deployments would need Redis-based locking instead

### Monitoring & Telemetry

**Log Patterns to Monitor:**

**Successful Orphan Cleanup:**
```
[SYNC_MAINTENANCE] 💀 Lock owner process {PID} is dead, cleaning up orphaned lock
[SYNC_MAINTENANCE] ✅ Cleaned up {N} orphaned lock(s)
```

**Active Lock Detected:**
```
[DAILY_SYNC] 🔍 Lock owner process {PID} is still alive
```

**Lock Acquisition:**
```
[DAILY_SYNC] ✅ Acquired distributed lock successfully
```

### Operational Procedures

#### Scenario 1: Worker Crashed
**Symptoms:** Sync stuck, lock exists, worker PID doesn't exist

**Resolution:**
1. System auto-recovers on next worker restart
2. Startup cleanup detects dead PID and removes lock
3. No manual intervention needed

**Verification:**
```sql
-- Check for orphaned locks
SELECT id, owner, expires_at, created_at FROM sync_locks;

-- Verify lock owner PID
SELECT owner FROM sync_locks WHERE id = 'daily_sync_lock';
-- Extract PID and check: ps aux | grep {PID}
```

#### Scenario 2: Manual Force-Clear Lock
**When to use:** Emergency override, debugging, confirmed orphaned lock

**Steps:**
```sql
-- Force delete the lock
DELETE FROM sync_locks WHERE id = 'daily_sync_lock';

-- Reset any stuck jobs
UPDATE job_queue 
SET status = 'QUEUED', attempts = attempts + 1 
WHERE status = 'RUNNING' AND type = 'DAILY_SYNC';
```

**Warning:** Only use when certain no active sync is running. Check worker logs first.

#### Scenario 3: Multiple Workers Detected
**Symptoms:** Multiple worker processes visible in `ps aux`

**Diagnosis:**
```bash
# Check running workers
ps aux | grep -E "tsx.*worker" | grep -v grep

# Count unique worker instances
ps aux | grep "sync-worker.ts" | grep -v grep | wc -l
```

**Resolution:**
```bash
# Kill all worker processes
pkill -9 -f "tsx worker"

# Restart workflow to start clean worker
# (System will auto-restart via start-dev.sh watchdog)
```

#### Scenario 4: Lock Expired But Still Present
**Symptoms:** Lock `expires_at` is past, but lock not cleaned up

**Root Cause:** Startup cleanup only runs on worker start, not continuously

**Resolution:**
1. Wait for next worker restart (auto-recovers)
2. Or trigger manual cleanup via database query (see Scenario 2)

### Invalid Date Telemetry

The system includes structured logging for invalid dates from AppFolio:

**Telemetry Events:**
```javascript
{
  event: 'INVALID_DATE_DETECTED',
  context: 'toEasternDate|toDateString|toEasternDateTime',
  invalidValue: '...',
  valueType: 'string|object|...',
  totalInvalidDatesThisSession: 123,
  timestamp: '...'
}
```

**Analytics Events:**
```javascript
{
  event: 'ANALYTICS_INVALID_DATE_SKIPPED',
  context: 'buildUnitsLeasingMaster|getMoveInsMTD',
  field: 'leaseEndDate|MoveIn',
  unitCode: '...',
  leaseId: '...',
  rawValue: '...',
  parsedDate: '...'
}
```

**Monitoring Queries:**
```sql
-- Check for data quality issues
SELECT COUNT(*) FROM raw_appfolio_lease_history 
WHERE payload_json->>'MoveIn' IS NULL 
OR payload_json->>'MoveIn' = 'Invalid Date';
```

### Health Checks

**System Health Indicators:**
1. Worker uptime: Should be stable, restarts indicate crashes
2. Lock churn: Frequent lock creation/deletion indicates instability
3. Invalid date count: Spikes indicate data quality issues from AppFolio
4. Stuck job count: Jobs in RUNNING state for >30 minutes

**Health Check Query:**
```sql
-- Overall system health
SELECT 
  (SELECT COUNT(*) FROM sync_locks) as active_locks,
  (SELECT COUNT(*) FROM job_queue WHERE status = 'RUNNING') as running_jobs,
  (SELECT COUNT(*) FROM job_queue WHERE status = 'QUEUED') as queued_jobs,
  (SELECT COUNT(*) FROM job_queue WHERE status = 'FAILED' AND updated_at > NOW() - INTERVAL '1 hour') as recent_failures;
```

### Deployment Considerations

**Before Deployment:**
1. Verify no active syncs are running
2. Check for orphaned locks
3. Note current worker PID for post-deployment verification

**During Deployment:**
1. Worker receives SIGTERM (graceful shutdown)
2. Worker releases lock in shutdown handler
3. New worker starts and runs startup cleanup
4. System auto-recovers

**After Deployment:**
1. Verify new worker started successfully
2. Check startup cleanup logs
3. Monitor first sync completion

### Troubleshooting

**Issue: "Another process is currently performing sync operation"**
- **Check:** Is there an active sync lock?
- **Verify:** Is the lock owner PID alive?
- **Action:** If dead, wait for next worker restart or force-clear lock

**Issue: Invalid dates in logs**
- **Check:** Review INVALID_DATE_DETECTED events
- **Identify:** Which AppFolio fields have corrupt data
- **Action:** Notify data team, system will skip corrupt records

**Issue: Worker constantly restarting**
- **Check:** Review crash logs in workflow output
- **Common Causes:** Database connection issues, memory exhaustion, unhandled exceptions
- **Action:** Review error logs, check database connectivity

### Code References

- **Lock Cleanup on Shutdown**: `worker/sync-worker.ts` (SIGTERM handler)
- **Startup Orphan Detection**: `lib/sync-maintenance-service.ts` (cleanupStaleLocks)
- **Acquisition-Time Validation**: `lib/daily-sync-manager.ts` (acquireDistributedLock)
- **Invalid Date Handling**: `lib/timezone-utils.ts` (EasternTimeManager)
- **Telemetry**: `lib/timezone-utils.ts`, `lib/occupancy-analytics.ts`

---

*Last Updated: October 10, 2025*
*System Version: Post-Ghost-Lock-Fix v1.0*
