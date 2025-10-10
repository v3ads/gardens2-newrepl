/**
 * Tenant Demographics ETL Pipeline
 * Builds analytics_tenant_daily mart from AppFolio raw reports
 */

// ARCHITECTURE FIX: Use PostgreSQL adapter for complete database unification
import { analyticsDb } from './analytics-db-pg';

// Helper functions for role detection - yesNo per requirements spec
function yesNo(v: any): boolean {
  return /^(yes|true|1|y)$/i.test(String(v || ''));
}

// Legacy alias for backward compatibility
function yesNoBool(v: any): boolean {
  return yesNo(v);
}

function isPrimaryRole(txt: string): boolean {
  return /(primary|leaseholder|head of household)/i.test(txt || '');
}

// Enhanced co-signer detection per requirements: /co[- ]?signer|cosigner|guarantor/i
function isCosignerRole(txt: string): boolean {
  return /co[- ]?signer|cosigner|guarantor/i.test(txt || '');
}

interface TenantRecord {
  snapshot_date: string;
  property_id: string;
  unit_code: string;
  lease_id: string | null;
  tenant_id: string;
  is_primary: number;
  cosigner_flag: number;
  student_flag: number;
  household_size: number | null;
  lease_length_days: number | null;
  tenure_days: number | null;
  payment_plan_active: number;
}

// Utility functions for data normalization
function normalizeUnitCode(unitCode: string): string {
  if (!unitCode) return '';
  return unitCode.trim().toUpperCase().replace(/\s+/g, ' ');
}

function resolveStudentFlag(unitCode: string): boolean {
  const normalized = normalizeUnitCode(unitCode);
  // Student rule: dash suffix indicates student housing (e.g., "114 - A")
  return normalized.includes(' - ');
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  
  try {
    // Handle MM/DD/YYYY format from AppFolio
    const trimmed = dateStr.trim();
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const [month, day, year] = parts;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return isNaN(date.getTime()) ? null : date;
    }
    
    // Try ISO format
    const isoDate = new Date(trimmed);
    return isNaN(isoDate.getTime()) ? null : isoDate;
  } catch (error) {
    console.error('[TENANT_ETL] Error parsing date:', dateStr, error);
    return null;
  }
}

function dateDiffDays(endDate: Date, startDate: Date): number {
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

export async function buildTenantMart(asOfDate: string = new Date().toISOString().split('T')[0]): Promise<{ success: boolean; recordsProcessed: number; duration: number; error?: string }> {
  const startTime = Date.now()
  console.log('[TENANT_ETL] Building tenant mart for:', asOfDate);
  
  const asOfDateObj = new Date(asOfDate + 'T23:59:59');
  
  try {
    // Clear existing data for this snapshot
    analyticsDb.prepare(`DELETE FROM analytics_tenant_daily WHERE snapshot_date = ?`).run(asOfDate);
    
    // Step 1: Get active leases from rent_roll and lease_history
    const activeLeases = getActiveLeases(asOfDateObj);
    console.log('[TENANT_ETL] Found active leases:', activeLeases.length);
    
    if (activeLeases.length === 0) {
      console.log('[TENANT_ETL] No active leases found. Debugging...');
      debugLeaseData(asOfDateObj);
    }
    
    // Step 2: Enhance with tenant directory data
    console.log('[TENANT_ETL] 🚀 ABOUT TO CALL enhanceWithTenantDirectory');
    const enhancedRecords = enhanceWithTenantDirectory(activeLeases, asOfDate, asOfDateObj);
    console.log('[TENANT_ETL] 🎯 RETURNED FROM enhanceWithTenantDirectory with', enhancedRecords.length, 'records');
    
    // Step 3: Calculate household sizes
    console.log('[TENANT_ETL] 📊 Records before household calculation:', enhancedRecords.length);
    const recordsWithHouseholds = calculateHouseholdSizes(enhancedRecords);
    console.log('[TENANT_ETL] 📊 Records after household calculation:', recordsWithHouseholds.length);
    
    // Step 4: Add payment plan information (optional)
    console.log('[TENANT_ETL] 💳 Records before payment plan info:', recordsWithHouseholds.length);
    const finalRecords = addPaymentPlanInfo(recordsWithHouseholds);
    console.log('[TENANT_ETL] 💳 Records after payment plan info:', finalRecords.length);
    
    // Step 5: Apply enhanced primary tenant guarantee before insertion
    await ensurePrimaryTenantGuarantee(asOfDate, finalRecords);
    
    // Step 6: Insert into database
    insertTenantRecords(finalRecords);
    
    // Step 7: Apply additional primary tenant fallback for edge cases
    console.log('[TENANT_ETL] Applying additional primary tenant fallbacks to database...');
    applyPrimaryFallbackToDatabase(asOfDate);
    
    const duration = Date.now() - startTime
    const recordsProcessed = finalRecords.length
    console.log('[TENANT_ETL] Successfully built tenant mart with', recordsProcessed, 'records in', duration, 'ms');
    
    return { success: true, recordsProcessed, duration }
    
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[TENANT_ETL] Error building tenant mart:', error);
    return { success: false, recordsProcessed: 0, duration, error: errorMessage }
  }
}

function getActiveLeases(asOfDate: Date): any[] {
  const activeLeases: any[] = [];
  
  // Get all pages from rent_roll to find current tenants
  const rentRollStmt = analyticsDb.prepare(`
    SELECT payload_json FROM raw_report_rent_roll ORDER BY ingested_at DESC
  `);
  const allRentRollData = rentRollStmt.all() as { payload_json: string }[];
  
  for (const rentRollData of allRentRollData) {
    const parsed = JSON.parse(rentRollData.payload_json);
    const results = parsed.results || [];
    console.log('[TENANT_ETL] Processing', results.length, 'rent roll records from page');
    
    for (const row of results) {
      // AppFolio rent_roll uses LeaseFrom/LeaseTo
      const leaseStart = parseDate(row.LeaseFrom);
      const leaseEnd = parseDate(row.LeaseTo);
      const moveOut = parseDate(row.MoveOut);
      
      // Only process current/occupied units (Status = "Current" means occupied in AppFolio)
      const status = row.Status || row.RentStatus || '';
      const isOccupied = status === 'Current';
      
      // Active lease filter - lease period covers asOfDate and not moved out
      const isActive = isOccupied && leaseStart && leaseEnd && 
                      leaseStart <= asOfDate && 
                      asOfDate <= leaseEnd && 
                      (!moveOut || moveOut > asOfDate);
      
      if (isActive && row.TenantId && row.Unit) {
        const unitCode = normalizeUnitCode(row.Unit);
        const moveIn = parseDate(row.MoveIn);
        
        activeLeases.push({
          source: 'rent_roll',
          tenant_id: row.TenantId,
          lease_id: row.OccupancyId || null, // AppFolio uses OccupancyId as lease identifier
          unit_code_norm: unitCode,
          property_id: row.PropertyId || 'unknown',
          lease_start_date: leaseStart,
          lease_end_date: leaseEnd,
          move_in_date: moveIn,
          move_out_date: moveOut,
          lease_length_days: leaseStart && leaseEnd ? dateDiffDays(leaseEnd, leaseStart) : null,
          tenure_days: moveIn ? dateDiffDays(asOfDate, moveIn) : null,
          residents_count: null // Will be calculated per unit
        });
      }
    }
  }
  
  // Supplement with lease_history
  const leaseHistoryStmt = analyticsDb.prepare(`
    SELECT payload_json FROM raw_report_lease_history ORDER BY ingested_at DESC LIMIT 1
  `);
  const leaseHistoryData = leaseHistoryStmt.get() as { payload_json: string } | undefined;
  
  if (leaseHistoryData) {
    const parsed = JSON.parse(leaseHistoryData.payload_json);
    const results = parsed.results || [];
    console.log('[TENANT_ETL] Processing', results.length, 'lease history records');
    
    for (const row of results) {
      // AppFolio lease_history uses LeaseStart/LeaseEnd
      const leaseStart = parseDate(row.LeaseStart);
      const leaseEnd = parseDate(row.LeaseEnd);
      const moveOut = parseDate(row.MoveOut);
      
      const isActive = leaseStart && leaseEnd && 
                      leaseStart <= asOfDate && 
                      asOfDate <= leaseEnd && 
                      (!moveOut || moveOut > asOfDate);
      
      if (isActive && row.TenantId && row.UnitName) {
        const unitCode = normalizeUnitCode(row.UnitName);
        const tenantId = row.TenantId;
        const leaseId = row.OccupancyId || null;
        
        // Avoid duplicates from rent_roll
        const exists = activeLeases.some(lease => 
          lease.tenant_id === tenantId && 
          lease.lease_id === leaseId && 
          lease.unit_code_norm === unitCode
        );
        
        if (!exists) {
          const moveIn = parseDate(row.MoveIn);
          
          activeLeases.push({
            source: 'lease_history',
            tenant_id: tenantId,
            lease_id: leaseId,
            unit_code_norm: unitCode,
            property_id: row.PropertyId || 'unknown',
            lease_start_date: leaseStart,
            lease_end_date: leaseEnd,
            move_in_date: moveIn,
            move_out_date: moveOut,
            lease_length_days: leaseStart && leaseEnd ? dateDiffDays(leaseEnd, leaseStart) : null,
            tenure_days: moveIn ? dateDiffDays(asOfDate, moveIn) : null,
            residents_count: null
          });
        }
      }
    }
  }
  
  return activeLeases;
}

// Map tenant directory column names to canonical role fields with enhanced regex patterns
function mapTenantDirectoryColumns(row: any): { role_text: string; is_primary_col: any; cosigner_col: any } {
  const keys = Object.keys(row);
  
  // Helper function for case/space tolerant column matching using regex patterns from requirements
  const findColumn = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = keys.find(k => pattern.test(k));
      if (match) return match;
    }
    return null;
  };
  
  // Map role_text from TenantType field (AppFolio structure) or other role fields
  let role_text = '';
  if (row.TenantType) {
    role_text = String(row.TenantType).toLowerCase();
  } else {
    const roleCol = findColumn([/^(role|resident role|relationship to lease|resident type|lease role)$/i]);
    role_text = roleCol ? String(row[roleCol] || '').toLowerCase() : '';
  }
  
  // Map is_primary using PrimaryTenant field (AppFolio) or other primary fields
  let is_primary_col = null;
  if (row.PrimaryTenant) {
    is_primary_col = row.PrimaryTenant;
  } else {
    const primaryCol = findColumn([/^(is[_ ]?primary|primary( tenant)?)$/i]);
    is_primary_col = primaryCol ? row[primaryCol] : null;
  }
  
  // Enhanced cosigner mapping: check TenantType for "Co-signer" or boolean columns
  let cosigner_col = null;
  if (row.TenantType === 'Co-signer') {
    cosigner_col = 'Yes';
  } else {
    const cosignerCol = findColumn([/^(cosigner|guarantor)$/i]);
    cosigner_col = cosignerCol ? row[cosignerCol] : null;
  }
  
  return { role_text, is_primary_col, cosigner_col };
}

function enhanceWithTenantDirectory(activeLeases: any[], snapshotDate: string, asOfDate: Date): TenantRecord[] {
  console.log('[TENANT_ETL] 🔥 ENTERING enhanceWithTenantDirectory with', activeLeases.length, 'active leases');
  const tenantRecords: TenantRecord[] = [];
  
  // Get tenant directory data - each row is a single tenant record  
  const tenantDirStmt = analyticsDb.prepare(`
    SELECT payload_json FROM raw_report_tenant_directory ORDER BY ingested_at DESC
  `);
  const allTenantDirData = tenantDirStmt.all() as { payload_json: string }[];
  
  let tenantLookup: Map<string, any> = new Map();
  
  if (allTenantDirData.length > 0) {
    console.log('[TENANT_ETL] Processing', allTenantDirData.length, 'tenant directory records');
    
    try {
      // Each row is a single tenant record
      for (const tenantDirData of allTenantDirData) {
        const row = JSON.parse(tenantDirData.payload_json);
        const tenantId = row.SelectedTenantId || row.TenantId || row.tenant_id;
        const unitCode = normalizeUnitCode(row.Unit || row.unit_code);
        
        if (tenantId) {
          tenantLookup.set(`${tenantId}_${unitCode}`, row);
        }
      }
      
      console.log('[TENANT_ETL] Built lookup table with', tenantLookup.size, 'entries');
      
      // Show sample record structure
      if (allTenantDirData.length > 0) {
        const sampleRow = JSON.parse(allTenantDirData[0].payload_json);
        console.log('[TENANT_ETL] Sample tenant record keys:', Object.keys(sampleRow));
        console.log('[TENANT_ETL] Sample PrimaryTenant value:', sampleRow.PrimaryTenant);
        console.log('[TENANT_ETL] Sample TenantType value:', sampleRow.TenantType);
      }
    } catch (error) {
      console.error('[TENANT_ETL] Error parsing tenant directory:', error);
    }
  }
  
  // Process each active lease to get primary tenant records
  for (const lease of activeLeases) {
    const lookupKey = `${lease.tenant_id}_${lease.unit_code_norm}`;
    const tenantInfo = tenantLookup.get(lookupKey);
    
    // Determine is_primary and cosigner_flag using improved mapping
    let isPrimary = 0;
    let cosignerFlag = 0;
    
    if (tenantInfo) {
      const { role_text, is_primary_col, cosigner_col } = mapTenantDirectoryColumns(tenantInfo);
      
      // Enhanced ETL rules from requirements:
      // is_primary = yesNo(is_primary) || isPrimaryRole(role_text) ? 1 : 0
      if (yesNo(is_primary_col) || isPrimaryRole(role_text)) {
        isPrimary = 1;
      }
      
      // cosigner_flag = yesNo(cosigner) || isCosignerRole(role_text) ? 1 : 0  
      if (yesNo(cosigner_col) || isCosignerRole(role_text)) {
        cosignerFlag = 1;
      }
    }
    
    // Resolve student flag
    const studentFlag = resolveStudentFlag(lease.unit_code_norm) ? 1 : 0;
    
    // Clean up tenure and lease length
    let tenureDays = lease.tenure_days;
    let leaseLengthDays = lease.lease_length_days;
    
    if (tenureDays !== null && tenureDays < 0) tenureDays = null;
    if (leaseLengthDays !== null && leaseLengthDays < 0) leaseLengthDays = null;
    
    tenantRecords.push({
      snapshot_date: snapshotDate,
      property_id: lease.property_id,
      unit_code: lease.unit_code_norm,
      lease_id: lease.lease_id,
      tenant_id: lease.tenant_id,
      is_primary: isPrimary,
      cosigner_flag: cosignerFlag,
      student_flag: studentFlag,
      household_size: lease.residents_count,
      lease_length_days: leaseLengthDays,
      tenure_days: tenureDays,
      payment_plan_active: 0
    });
  }
  
  // Add cosigner records from tenant directory that share leases with active tenants
  console.log('='.repeat(80));
  console.log('[TENANT_ETL] ===== COSIGNER DETECTION PHASE =====');
  console.log('='.repeat(80));
  
  // Force logging of key info for debugging
  console.log('[TENANT_ETL] 🔥 COSIGNER DEBUG - tenant directory count:', allTenantDirData.length);
  console.log('[TENANT_ETL] 🔥 COSIGNER DEBUG - active leases count:', activeLeases.length);
  const activeLeasesSet = new Set(activeLeases.map(l => l.lease_id).filter(id => id));
  console.log('[TENANT_ETL] Found', activeLeasesSet.size, 'active leases');
  console.log('[TENANT_ETL] Sample active lease IDs:', Array.from(activeLeasesSet).slice(0, 5));
  
  // Create normalized lease ID lookup
  const normalizedLeaseIdMap = new Map<string, string>();
  for (const leaseId of activeLeasesSet) {
    // Map multiple formats to the same lease
    normalizedLeaseIdMap.set(String(leaseId), String(leaseId)); // exact
    normalizedLeaseIdMap.set(String(parseFloat(String(leaseId))), String(leaseId)); // 301.0 -> 301 maps to 301.0
    if (!String(leaseId).includes('.')) {
      normalizedLeaseIdMap.set(String(leaseId) + '.0', String(leaseId)); // 301 -> 301.0 maps to 301
    }
  }
  
  // Check for cosigners directly by TenantType = "Co-signer"
  let cosignersAdded = 0;
  let cosignersFound = 0;
  let cosignersWithActiveLeases = 0;
  
  // Create simpler active lease ID set for matching
  const activeLeaseLookup = new Set();
  for (const lease of activeLeases) {
    const leaseId = String(lease.lease_id);
    activeLeaseLookup.add(leaseId); // exact match (e.g., "301.0")
    if (leaseId.includes('.')) {
      activeLeaseLookup.add(leaseId.split('.')[0]); // integer version (e.g., "301")
    }
  }
  
  console.log('[TENANT_ETL] Active lease lookup size:', activeLeaseLookup.size);
  console.log('[TENANT_ETL] Sample active lease formats:', Array.from(activeLeaseLookup).slice(0, 10));
  
  // Process each tenant directory record to find cosigners
  for (const tenantDirData of allTenantDirData) {
    try {
      const row = JSON.parse(tenantDirData.payload_json);
      const tenantType = row.TenantType;
      
      // Only process records that are explicitly marked as cosigners
      if (tenantType === 'Co-signer') {
        cosignersFound++;
        const tenantId = row.SelectedTenantId || row.TenantId;
        const leaseId = String(row.OccupancyId || '');
        const unitCode = normalizeUnitCode(row.Unit || '');
        
        // Check if this cosigner's lease is active
        if (tenantId && leaseId && activeLeaseLookup.has(leaseId)) {
          cosignersWithActiveLeases++;
          console.log('[TENANT_ETL] 🎯 FOUND COSIGNER WITH ACTIVE LEASE:', { tenantId, leaseId, unitCode });
          
          // Find the matching active lease for lease details
          const matchingLease = activeLeases.find(l => {
            const activeLeaseId = String(l.lease_id);
            return activeLeaseId === leaseId || 
                   activeLeaseId === leaseId + '.0' ||
                   activeLeaseId.split('.')[0] === leaseId;
          });
          
          if (matchingLease) {
            // Check if not already in our records
            const alreadyExists = tenantRecords.some(r => 
              r.tenant_id === String(tenantId) && 
              (r.lease_id === String(matchingLease.lease_id) || r.lease_id === leaseId)
            );
            
            if (!alreadyExists) {
              const studentFlag = resolveStudentFlag(unitCode) ? 1 : 0;
              
              tenantRecords.push({
                snapshot_date: snapshotDate,
                property_id: matchingLease.property_id,
                unit_code: unitCode,
                lease_id: String(matchingLease.lease_id), // Use the active lease ID format
                tenant_id: String(tenantId),
                is_primary: 0, // Cosigners are never primary
                cosigner_flag: 1,
                student_flag: studentFlag,
                household_size: null,
                lease_length_days: matchingLease.lease_length_days,
                tenure_days: matchingLease.tenure_days,
                payment_plan_active: 0
              });
              
              cosignersAdded++;
              console.log('[TENANT_ETL] ✅ ADDED COSIGNER:', tenantId, 'for lease:', matchingLease.lease_id);
            } else {
              console.log('[TENANT_ETL] Cosigner already exists in records:', tenantId);
            }
          } else {
            console.log('[TENANT_ETL] ERROR: Active lease lookup found but matching lease not found for:', leaseId);
          }
        }
      }
    } catch (error) {
      console.error('[TENANT_ETL] Error processing tenant directory row:', error);
    }
  }
  
  console.log('[TENANT_ETL] Cosigners in directory:', cosignersFound);
  console.log('[TENANT_ETL] Cosigners with active leases:', cosignersWithActiveLeases);
  console.log('[TENANT_ETL] Cosigners added to mart:', cosignersAdded);
  const cosignerCount = tenantRecords.filter(r => r.cosigner_flag === 1).length;
  console.log('[TENANT_ETL] Total tenant records (including cosigners):', tenantRecords.length);
  console.log('[TENANT_ETL] Cosigner records found:', cosignerCount);
  console.log('[TENANT_ETL] FINAL RECORD COUNTS BEFORE DATABASE INSERTION:', {
    total: tenantRecords.length,
    cosigners: cosignerCount,
    primaries: tenantRecords.filter(r => r.is_primary === 1).length
  });
  
  // Apply primary tenant fallback rule: guarantee one primary per lease
  applyPrimaryTenantFallback(tenantRecords);
  
  return tenantRecords;
}

function applyPrimaryTenantFallback(records: TenantRecord[]): void {
  console.log('[TENANT_ETL] Applying primary tenant fallback...');
  
  // Group by lease_id
  const leaseGroups = new Map<string, TenantRecord[]>();
  
  for (const record of records) {
    if (record.lease_id) {
      const key = record.lease_id;
      if (!leaseGroups.has(key)) {
        leaseGroups.set(key, []);
      }
      leaseGroups.get(key)!.push(record);
    }
  }
  
  let fallbacksApplied = 0;
  
  for (const [leaseId, leaseRecords] of leaseGroups) {
    // Check if lease has any primary tenant
    const hasPrimary = leaseRecords.some(r => r.is_primary === 1);
    
    if (!hasPrimary) {
      // Find non-cosigner tenants
      const nonCosigners = leaseRecords.filter(r => r.cosigner_flag === 0);
      
      if (nonCosigners.length > 0) {
        // Pick tenant with earliest move_in_date (or lowest tenant_id as fallback)
        const primaryTenant = nonCosigners.reduce((earliest, current) => {
          // Compare by move_in_date if available
          if (earliest.tenure_days !== null && current.tenure_days !== null) {
            return current.tenure_days > earliest.tenure_days ? current : earliest;
          }
          // Fallback to tenant_id comparison
          return current.tenant_id < earliest.tenant_id ? current : earliest;
        });
        
        primaryTenant.is_primary = 1;
        fallbacksApplied++;
        console.log(`[TENANT_ETL] Applied fallback primary for lease ${leaseId}: tenant ${primaryTenant.tenant_id}`);
      }
    }
  }
  
  console.log(`[TENANT_ETL] Primary fallback applied to ${fallbacksApplied} leases`);
}

function applyPrimaryFallbackToDatabase(snapshotDate: string): void {
  console.log('[TENANT_ETL] Applying primary tenant fallback directly to database...');
  
  // Find leases without primary tenants
  const leasesWithoutPrimaryStmt = analyticsDb.prepare(`
    SELECT DISTINCT lease_id
    FROM analytics_tenant_daily
    WHERE snapshot_date = ? 
      AND lease_id IS NOT NULL
      AND lease_id NOT IN (
        SELECT DISTINCT lease_id
        FROM analytics_tenant_daily 
        WHERE snapshot_date = ? AND is_primary = 1 AND lease_id IS NOT NULL
      )
  `);
  
  const leasesWithoutPrimary = leasesWithoutPrimaryStmt.all(snapshotDate, snapshotDate) as { lease_id: string }[];
  console.log(`[TENANT_ETL] Found ${leasesWithoutPrimary.length} leases without primary tenants`);
  
  let fallbacksApplied = 0;
  
  // For each lease without a primary, find the best candidate
  for (const { lease_id } of leasesWithoutPrimary) {
    const candidatesStmt = analyticsDb.prepare(`
      SELECT tenant_id, tenure_days, cosigner_flag
      FROM analytics_tenant_daily
      WHERE snapshot_date = ? AND lease_id = ? AND cosigner_flag = 0
      ORDER BY tenure_days DESC, tenant_id ASC
      LIMIT 1
    `);
    
    const candidate = candidatesStmt.get(snapshotDate, lease_id) as { tenant_id: string } | undefined;
    
    if (candidate) {
      // Update this tenant to be primary
      const updateStmt = analyticsDb.prepare(`
        UPDATE analytics_tenant_daily 
        SET is_primary = 1 
        WHERE snapshot_date = ? AND lease_id = ? AND tenant_id = ?
      `);
      
      updateStmt.run(snapshotDate, lease_id, candidate.tenant_id);
      fallbacksApplied++;
      console.log(`[TENANT_ETL] Set tenant ${candidate.tenant_id} as primary for lease ${lease_id}`);
    }
  }
  
  console.log(`[TENANT_ETL] Database fallback applied to ${fallbacksApplied} leases`);
}

// Enhanced primary tenant guarantee: synthesize placeholders for active leases with no tenants
async function ensurePrimaryTenantGuarantee(asOfDate: string, tenantRecords: TenantRecord[]): Promise<void> {
  console.log('[TENANT_ETL] Ensuring primary tenant guarantee...');
  
  try {
    // Get all active leases for the date
    const asOfDateObj = new Date(asOfDate);
    const activeLeases = getActiveLeases(asOfDateObj);
    
    // Group tenant records by lease_id
    const leaseMap = new Map<string, TenantRecord[]>();
    for (const record of tenantRecords) {
      if (record.lease_id) {
        if (!leaseMap.has(record.lease_id)) {
          leaseMap.set(record.lease_id, []);
        }
        leaseMap.get(record.lease_id)!.push(record);
      }
    }
    
    let synthesizedCount = 0;
    
    for (const lease of activeLeases) {
      const leaseRecords = leaseMap.get(lease.lease_id) || [];
      const hasPrimary = leaseRecords.some(r => r.is_primary === 1);
      
      if (!hasPrimary) {
        // Check if we have any non-cosigner tenants
        const nonCosigners = leaseRecords.filter(r => r.cosigner_flag === 0);
        
        if (nonCosigners.length > 0) {
          // Set earliest move-in as primary (highest tenure)
          const primaryCandidate = nonCosigners.reduce((best, current) => {
            if (current.tenure_days !== null && best.tenure_days !== null) {
              return current.tenure_days > best.tenure_days ? current : best;
            }
            return current.tenant_id < best.tenant_id ? current : best;
          });
          primaryCandidate.is_primary = 1;
        } else {
          // Synthesize placeholder primary tenant
          const placeholder: TenantRecord = {
            snapshot_date: asOfDate,
            property_id: lease.property_id,
            unit_code: lease.unit_code_norm,
            lease_id: lease.lease_id,
            tenant_id: `UNKNOWN-${lease.lease_id}`,
            is_primary: 1,
            cosigner_flag: 0,
            student_flag: resolveStudentFlag(lease.unit_code_norm) ? 1 : 0,
            household_size: lease.residents_count || 1,
            lease_length_days: lease.lease_length_days,
            tenure_days: lease.tenure_days,
            payment_plan_active: 0
          };
          
          tenantRecords.push(placeholder);
          leaseMap.set(lease.lease_id, [...leaseRecords, placeholder]);
          synthesizedCount++;
          console.log(`[TENANT_ETL] Synthesized primary tenant for lease ${lease.lease_id}: ${placeholder.tenant_id}`);
        }
      }
    }
    
    console.log(`[TENANT_ETL] Primary guarantee complete: synthesized ${synthesizedCount} placeholder tenants`);
    
  } catch (error) {
    console.error('[TENANT_ETL] Error in primary tenant guarantee:', error);
  }
}

function calculateHouseholdSizes(records: TenantRecord[]): TenantRecord[] {
  // Group by unit_code to calculate household sizes where missing
  const unitGroups = new Map<string, TenantRecord[]>();
  
  for (const record of records) {
    const key = record.unit_code;
    if (!unitGroups.has(key)) {
      unitGroups.set(key, []);
    }
    unitGroups.get(key)!.push(record);
  }
  
  // Calculate household sizes
  for (const [unitCode, unitRecords] of unitGroups) {
    // Check if we have residents_count from rent_roll
    const hasResidentsCount = unitRecords.some(r => r.household_size !== null);
    
    if (!hasResidentsCount) {
      // Derive from count of distinct active tenants
      const distinctTenants = new Set(unitRecords.map(r => r.tenant_id)).size;
      
      // Set household_size for all records in this unit
      for (const record of unitRecords) {
        record.household_size = distinctTenants;
      }
    }
  }
  
  return records;
}

function addPaymentPlanInfo(records: TenantRecord[]): TenantRecord[] {
  // Check if payment plans table exists
  try {
    const paymentPlansStmt = analyticsDb.prepare(`
      SELECT payload_json FROM raw_report_payment_plans ORDER BY ingested_at DESC LIMIT 1
    `);
    const paymentPlansData = paymentPlansStmt.get() as { payload_json: string } | undefined;
    
    if (paymentPlansData) {
      const parsed = JSON.parse(paymentPlansData.payload_json);
      const results = parsed.results || [];
      
      const activePlans = new Set<string>();
      
      for (const row of results) {
        const status = row.status || row.Status || '';
        if (/active/i.test(status)) {
          const key = `${row.tenant_id || row.TenantId}_${row.lease_id || row.LeaseId}`;
          activePlans.add(key);
        }
      }
      
      // Update records with payment plan info
      for (const record of records) {
        const key = `${record.tenant_id}_${record.lease_id}`;
        if (activePlans.has(key)) {
          record.payment_plan_active = 1;
        }
      }
    }
  } catch (error) {
    console.log('[TENANT_ETL] Payment plans table not available, skipping');
  }
  
  return records;
}

function insertTenantRecords(records: TenantRecord[]): void {
  console.log('[TENANT_ETL] ===== DATABASE INSERTION PHASE =====');
  console.log('[TENANT_ETL] Records to insert:', records.length);
  console.log('[TENANT_ETL] Cosigners to insert:', records.filter(r => r.cosigner_flag === 1).length);
  
  const insertStmt = analyticsDb.prepare(`
    INSERT OR REPLACE INTO analytics_tenant_daily (
      snapshot_date, property_id, unit_code, lease_id, tenant_id,
      is_primary, cosigner_flag, student_flag, household_size,
      lease_length_days, tenure_days, payment_plan_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const now = new Date().toISOString();
  let insertedCount = 0;
  let cosignerInsertedCount = 0;
  
  const insertMany = analyticsDb.transaction((records: TenantRecord[]) => {
    for (const record of records) {
      try {
        insertStmt.run(
          record.snapshot_date,
          record.property_id,
          record.unit_code,
          record.lease_id,
          record.tenant_id,
          record.is_primary,
          record.cosigner_flag,
          record.student_flag,
          record.household_size,
          record.lease_length_days,
          record.tenure_days,
          record.payment_plan_active,
          now
        );
        insertedCount++;
        if (record.cosigner_flag === 1) cosignerInsertedCount++;
      } catch (error) {
        console.error('[TENANT_ETL] Insert error for record:', record, error);
      }
    }
  });
  
  insertMany(records);
  console.log('[TENANT_ETL] Database insertion complete:', { insertedCount, cosignerInsertedCount });
}

function debugLeaseData(asOfDate: Date): void {
  console.log('[TENANT_ETL] Debug - As of date:', asOfDate.toISOString());
  
  // Check rent roll data
  const rentRollStmt = analyticsDb.prepare(`SELECT payload_json FROM raw_report_rent_roll ORDER BY ingested_at DESC LIMIT 1`);
  const rentRollData = rentRollStmt.get() as { payload_json: string } | undefined;
  
  if (rentRollData) {
    const parsed = JSON.parse(rentRollData.payload_json);
    const results = parsed.results || [];
    
    console.log('[TENANT_ETL] Debug - Total rent roll records:', results.length);
    
    let currentCount = 0;
    let validDatesCount = 0;
    
    for (const row of results) {
      if (row.Status === 'Current') {
        currentCount++;
        
        const leaseStart = parseDate(row.LeaseFrom);
        const leaseEnd = parseDate(row.LeaseTo);
        
        console.log('[TENANT_ETL] Debug - Current tenant:', {
          tenantId: row.TenantId,
          unit: row.Unit,
          leaseFrom: row.LeaseFrom,
          leaseTo: row.LeaseTo,
          parsedStart: leaseStart?.toDateString(),
          parsedEnd: leaseEnd?.toDateString(),
          isValidDates: !!(leaseStart && leaseEnd)
        });
        
        if (leaseStart && leaseEnd) {
          validDatesCount++;
          
          const activeCheck = leaseStart <= asOfDate && asOfDate <= leaseEnd;
          console.log('[TENANT_ETL] Debug - Active check:', {
            startBeforeAsOf: leaseStart <= asOfDate,
            asOfBeforeEnd: asOfDate <= leaseEnd,
            isActive: activeCheck
          });
        }
        
        if (currentCount >= 3) break; // Only show first 3 for debugging
      }
    }
    
    console.log('[TENANT_ETL] Debug - Current tenants:', currentCount);
    console.log('[TENANT_ETL] Debug - Valid dates:', validDatesCount);
  }
}

export function getLatestTenantSnapshot(): string | null {
  const stmt = analyticsDb.prepare(`
    SELECT MAX(snapshot_date) as latest_snapshot 
    FROM analytics_tenant_daily
  `);
  const result = stmt.get() as { latest_snapshot: string | null } | undefined;
  return result?.latest_snapshot || null;
}