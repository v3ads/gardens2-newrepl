# Runtime Validation Protocol
*Preventing $100+ Daily Fixes Through Proper Testing*

## Overview
This protocol ensures database operations, sync processes, and critical infrastructure actually work at runtime, not just in code review.

## 🚨 Critical Rule
**ALL database-touching code MUST pass runtime validation before deployment**

## 1. Database Operation Testing

### Before Every Database Change:
```bash
# 1. Schema Validation Test
npm run db:push --dry-run  # Check for destructive changes
npm run db:push            # Apply changes safely

# 2. Runtime Operation Test  
node -e "
const { PrismaClient } = require('@prisma/client');
async function test() {
  const prisma = new PrismaClient();
  
  // Test the exact operations your code will perform
  // Example for sync_locks:
  const result = await prisma.\$executeRaw\`
    INSERT INTO sync_locks (id, owner, expires_at, created_at, updated_at) 
    VALUES ('test', 'test-owner', NOW() + INTERVAL '30 minutes', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET owner = 'test-owner'
  \`;
  
  console.log('✅ Database operation test passed');
  await prisma.\$disconnect();
}
test().catch(console.error);
"
```

### Schema-Code Validation:
```bash
# Verify table structure matches INSERT/UPDATE statements
psql $DATABASE_URL -c "\d+ your_table_name"

# Compare with your code's expectations
grep -r "INSERT INTO your_table" lib/
```

## 2. Sync Process Testing

### Before Deploying Sync Changes:
```bash
# 1. Test lock acquisition works
curl -X POST http://localhost:5000/api/test/sync-lock

# 2. Test master CSV sync doesn't fail silently  
curl -X POST http://localhost:5000/api/test/master-csv-sync

# 3. Test KPI calculation matches data source
curl -X GET http://localhost:5000/api/test/data-consistency
```

## 3. Integration Testing

### Mandatory Integration Tests:
- [ ] **Lock Acquisition**: Can acquire and release distributed locks
- [ ] **Master CSV Sync**: Data actually updates, not just "success" status
- [ ] **KPI Consistency**: Dashboard reads same data as backend calculates
- [ ] **Email Delivery**: Emails actually send with error tracking
- [ ] **Data Freshness**: APIs return current data, not stale cache

## 4. Validation API Endpoints

Create these test endpoints for runtime validation:

### `/api/test/sync-lock` - Test Lock Operations
```javascript
// Test lock acquisition/release cycle
const manager = DailySyncManager.getInstance();
const acquired = await manager.acquireDistributedLock();
if (!acquired) throw new Error('Lock acquisition failed');
await manager.releaseDistributedLock();
return { success: true, message: 'Lock operations working' };
```

### `/api/test/data-consistency` - Test Data Sources Match
```javascript
// Compare KPI table vs UnifiedAnalytics vs master CSV
const kpiData = await getOccupancyKPIs('latest');
const unifiedData = await UnifiedAnalytics.getOccupancyMetrics();
const variance = Math.abs(kpiData.occupied_units - unifiedData.occupiedUnits);
if (variance > 0) throw new Error(`Data inconsistency: ${variance} unit difference`);
return { success: true, variance: 0 };
```

### `/api/test/master-csv-sync` - Test CSV Updates
```javascript
// Verify master CSV actually updates with fresh data
const beforeCount = await prisma.masterCsvData.count();
const beforeChecksum = await getMasterCsvChecksum();
await MasterCSVSync.performSync();
const afterCount = await prisma.masterCsvData.count();
const afterChecksum = await getMasterCsvChecksum();

if (beforeChecksum === afterChecksum) {
  throw new Error('Master CSV sync did not update data');
}
return { success: true, recordsChanged: afterCount - beforeCount };
```

## 5. Pre-Deployment Checklist

**Before ANY deployment:**
- [ ] Run runtime validation tests
- [ ] Verify database schema matches code
- [ ] Test actual API endpoints (not just code logic)
- [ ] Validate data freshness contracts
- [ ] Check error handling paths work

## 6. Root Cause Prevention

### Common Issues to Test:
1. **Schema Mismatches**: Table missing columns that INSERT uses
2. **Silent Failures**: Functions return "success" but don't actually work  
3. **Data Source Splits**: Multiple sources of truth with inconsistent data
4. **Stale Cache**: APIs serving old data despite fresh backend updates
5. **Race Conditions**: Broken locking mechanisms

### Testing Pattern:
```javascript
// For EVERY database operation:
1. Create test data
2. Perform the operation  
3. Verify the result (not just the return status)
4. Clean up test data

// Example:
const testId = 'test-' + Date.now();
await performOperation(testId);
const result = await verifyOperationWorked(testId);
if (!result.success) throw new Error('Operation failed verification');
await cleanupTestData(testId);
```

## 7. Success Metrics

**Zero tolerance for:**
- Database operation failures due to schema mismatches
- "Successful" syncs that don't actually update data
- Stale data being served to users
- Silent email delivery failures

**Target:**
- 100% runtime validation before deployment
- Zero surprise failures in production
- Stable, predictable operations

---

**Remember**: Code reviews check logic. Runtime validation checks reality.
**Never deploy database changes without runtime testing.**