// ARCHITECTURE FIX: Use PostgreSQL adapter for complete database unification  
import { analyticsDb } from './analytics-db-pg'
import { dataQualityMonitor } from './data-quality-monitor'

export interface AnalyticsBuildResult {
  success: boolean
  stepResults: {
    unitsLeasingMaster: { success: boolean; recordsProcessed: number; duration: number; error?: string }
    tenantMart: { success: boolean; recordsProcessed: number; duration: number; error?: string }
    operationsMart: { success: boolean; recordsProcessed: number; duration: number; error?: string }
    forecastViews: { success: boolean; recordsProcessed: number; duration: number; error?: string }
  }
  totalDuration: number
  totalRecordsProcessed: number
}

export async function buildAllAnalytics(): Promise<AnalyticsBuildResult> {
  const overallStartTime = Date.now()
  console.log('[ANALYTICS_BUILDER] Starting complete analytics build pipeline...')

  const result: AnalyticsBuildResult = {
    success: true,
    stepResults: {
      unitsLeasingMaster: { success: false, recordsProcessed: 0, duration: 0 },
      tenantMart: { success: false, recordsProcessed: 0, duration: 0 },
      operationsMart: { success: false, recordsProcessed: 0, duration: 0 },
      forecastViews: { success: false, recordsProcessed: 0, duration: 0 }
    },
    totalDuration: 0,
    totalRecordsProcessed: 0
  }

  try {
    // Step 1: Build Units Leasing Master
    result.stepResults.unitsLeasingMaster = await buildUnitsLeasingMaster()
    if (!result.stepResults.unitsLeasingMaster.success) {
      result.success = false
    }

    // Step 2: Build Tenant Mart
    result.stepResults.tenantMart = await buildTenantMart()
    if (!result.stepResults.tenantMart.success) {
      result.success = false
    }

    // Step 3: Build Operations Mart
    result.stepResults.operationsMart = await buildOperationsMart()
    if (!result.stepResults.operationsMart.success) {
      result.success = false
    }

    // Step 4: Build Forecast Views
    result.stepResults.forecastViews = await buildForecastViews()
    if (!result.stepResults.forecastViews.success) {
      result.success = false
    }

    // Calculate totals
    result.totalDuration = Date.now() - overallStartTime
    result.totalRecordsProcessed = Object.values(result.stepResults)
      .reduce((sum, step) => sum + step.recordsProcessed, 0)

    // Update analytics_meta.last_snapshot_at
    if (result.success) {
      updateAnalyticsMetaSnapshot(result.totalRecordsProcessed)
      console.log(`[ANALYTICS_BUILDER] ✅ Analytics build completed successfully in ${result.totalDuration}ms`)
      console.log(`[ANALYTICS_BUILDER] Total records processed: ${result.totalRecordsProcessed}`)
    } else {
      console.log(`[ANALYTICS_BUILDER] ❌ Analytics build completed with errors in ${result.totalDuration}ms`)
    }

    // Monitor analytics build results for data quality issues
    try {
      await dataQualityMonitor.monitorAnalyticsBuildResults(result.stepResults)
    } catch (monitorError) {
      console.error('[ANALYTICS_BUILDER] ⚠️ Data quality monitoring failed:', monitorError)
      // Don't fail the build if monitoring fails
    }

    return result

  } catch (error) {
    result.success = false
    result.totalDuration = Date.now() - overallStartTime
    console.error('[ANALYTICS_BUILDER] Fatal error during analytics build:', error)
    throw error
  }
}

export async function buildUnitsLeasingMaster(): Promise<{ success: boolean; recordsProcessed: number; duration: number; error?: string }> {
  const startTime = Date.now()
  console.log('[ANALYTICS_BUILDER] Building Units Leasing Master...')
  
  try {
    // Create or update units_leasing_master table
    analyticsDb.exec(`
      CREATE TABLE IF NOT EXISTS units_leasing_master (
        unit_id TEXT PRIMARY KEY,
        property_id TEXT,
        unit_number TEXT,
        unit_type TEXT,
        bedrooms INTEGER,
        bathrooms REAL,
        square_feet INTEGER,
        market_rent REAL,
        current_rent REAL,
        is_occupied BOOLEAN,
        tenant_id TEXT,
        lease_start_date DATE,
        lease_end_date DATE,
        move_in_date DATE,
        move_out_date DATE,
        status TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Clear and rebuild from latest AppFolio data
    analyticsDb.exec('DELETE FROM units_leasing_master')

    // Extract and transform data from raw reports
    const unitsQuery = `
      SELECT 
        json_extract(payload_json, '$.UnitId') as unit_id,
        json_extract(payload_json, '$.PropertyId') as property_id,
        json_extract(payload_json, '$.Unit') as unit_number,
        json_extract(payload_json, '$.UnitType') as unit_type,
        payload_json
      FROM raw_appfolio_units
    `

    const tenantsQuery = `
      SELECT 
        json_extract(payload_json, '$.UnitId') as unit_id,
        json_extract(payload_json, '$.SelectedTenantId') as tenant_id,
        json_extract(payload_json, '$.Status') as status,
        json_extract(payload_json, '$.Rent') as current_rent,
        json_extract(payload_json, '$.MoveIn') as move_in_date,
        json_extract(payload_json, '$.MoveOut') as move_out_date,
        json_extract(payload_json, '$.LeaseFrom') as lease_start_date,
        json_extract(payload_json, '$.LeaseTo') as lease_end_date,
        payload_json
      FROM raw_appfolio_tenants
      WHERE json_extract(payload_json, '$.Status') = 'Current'
    `

    const units = analyticsDb.prepare(unitsQuery).all() as any[]
    const tenants = analyticsDb.prepare(tenantsQuery).all() as any[]

    // Create a map of unit_id to tenant data
    const tenantsByUnitId = new Map<string, any>()
    tenants.forEach((tenant: any) => {
      if (tenant.unit_id) {
        tenantsByUnitId.set(tenant.unit_id.toString(), tenant)
      }
    })

    // Insert combined data
    const insertStmt = analyticsDb.prepare(`
      INSERT INTO units_leasing_master (
        unit_id, property_id, unit_number, unit_type, 
        current_rent, is_occupied, tenant_id, lease_start_date, 
        lease_end_date, move_in_date, move_out_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let recordsProcessed = 0
    for (const unit of units) {
      const unitData = unit as any
      const tenant = tenantsByUnitId.get(unitData.unit_id?.toString())
      
      insertStmt.run(
        unitData.unit_id,
        unitData.property_id,
        unitData.unit_number,
        unitData.unit_type,
        tenant ? parseFloat(tenant.current_rent?.replace(/,/g, '') || '0') : null,
        tenant ? true : false,
        tenant?.tenant_id || null,
        tenant?.lease_start_date || null,
        tenant?.lease_end_date || null,
        tenant?.move_in_date || null,
        tenant?.move_out_date || null,
        tenant?.status || 'Vacant'
      )
      recordsProcessed++
    }

    const duration = Date.now() - startTime
    console.log(`[ANALYTICS_BUILDER] ✅ Units Leasing Master built: ${recordsProcessed} records in ${duration}ms`)
    
    return { success: true, recordsProcessed, duration }

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ANALYTICS_BUILDER] ❌ Error building Units Leasing Master:', error)
    return { success: false, recordsProcessed: 0, duration, error: errorMessage }
  }
}



export async function buildTenantMart(): Promise<{ success: boolean; recordsProcessed: number; duration: number; error?: string }> {
  const startTime = Date.now()
  console.log('[ANALYTICS_BUILDER] Building Tenant Mart...')
  
  try {
    // Create tenant_mart table
    analyticsDb.exec(`
      CREATE TABLE IF NOT EXISTS tenant_mart (
        tenant_id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        full_name TEXT,
        email TEXT,
        phone TEXT,
        property_id TEXT,
        unit_id TEXT,
        unit_number TEXT,
        status TEXT,
        move_in_date DATE,
        move_out_date DATE,
        lease_start_date DATE,
        lease_end_date DATE,
        rent_amount REAL,
        deposit_amount REAL,
        balance REAL,
        portal_activated BOOLEAN,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Create temp table for atomic swap
    analyticsDb.exec(`
      CREATE TABLE IF NOT EXISTS tenant_mart_temp (
        tenant_id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        full_name TEXT,
        email TEXT,
        phone TEXT,
        property_id TEXT,
        unit_id TEXT,
        unit_number TEXT,
        status TEXT,
        move_in_date DATE,
        move_out_date DATE,
        lease_start_date DATE,
        lease_end_date DATE,
        rent_amount REAL,
        deposit_amount REAL,
        balance REAL,
        portal_activated BOOLEAN,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Start transaction
    analyticsDb.exec('BEGIN TRANSACTION')
    
    try {
      // Clear temp table
      analyticsDb.exec('DELETE FROM tenant_mart_temp')

    const query = `
      SELECT payload_json
      FROM raw_report_tenant_directory
    `

    const records = analyticsDb.prepare(query).all() as any[]

    const insertStmt = analyticsDb.prepare(`
      INSERT OR REPLACE INTO tenant_mart_temp (
        tenant_id, first_name, last_name, full_name, email, phone,
        property_id, unit_id, unit_number, status, move_in_date, 
        move_out_date, lease_start_date, lease_end_date, rent_amount, 
        deposit_amount, portal_activated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let recordsProcessed = 0
    for (const record of records) {
      const data = JSON.parse(record.payload_json as string)
      
      insertStmt.run(
        data.SelectedTenantId,
        data.FirstName || '',
        data.LastName || '',
        data.Tenant || `${data.FirstName || ''} ${data.LastName || ''}`.trim(),
        data.Emails || '',
        data.PhoneNumbers || '',
        data.PropertyId,
        data.UnitId,
        data.Unit,
        data.Status,
        data.MoveIn || null,
        data.MoveOut || null,
        data.LeaseFrom || null,
        data.LeaseTo || null,
        parseFloat(data.Rent?.replace(/[,$]/g, '') || '0'),
        parseFloat(data.Deposit?.replace(/[,$]/g, '') || '0'),
        data.TenantPortalActivated === 'Yes' ? 1 : 0
      )
      recordsProcessed++
    }

    // Atomic swap: Delete old data and copy temp to main
    analyticsDb.exec('DELETE FROM tenant_mart')
    analyticsDb.exec('INSERT INTO tenant_mart SELECT * FROM tenant_mart_temp')
    
    // Commit transaction
    analyticsDb.exec('COMMIT')
    
    const duration = Date.now() - startTime
    console.log(`[ANALYTICS_BUILDER] ✅ Tenant Mart built: ${recordsProcessed} records in ${duration}ms`)
    
    return { success: true, recordsProcessed, duration }
    
    } catch (innerError) {
      // Rollback on error
      analyticsDb.exec('ROLLBACK')
      throw innerError
    }

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ANALYTICS_BUILDER] ❌ Error building Tenant Mart:', error)
    return { success: false, recordsProcessed: 0, duration, error: errorMessage }
  }
}

export async function buildOperationsMart(): Promise<{ success: boolean; recordsProcessed: number; duration: number; error?: string }> {
  const startTime = Date.now()
  console.log('[ANALYTICS_BUILDER] Building Operations Mart...')
  
  try {
    // Create operations_mart table
    analyticsDb.exec(`
      CREATE TABLE IF NOT EXISTS operations_mart (
        id TEXT PRIMARY KEY,
        property_id TEXT,
        unit_id TEXT,
        unit_number TEXT,
        work_order_id TEXT,
        work_order_type TEXT,
        status TEXT,
        priority TEXT,
        created_date DATE,
        completed_date DATE,
        description TEXT,
        vendor_id TEXT,
        vendor_name TEXT,
        cost_amount REAL,
        category TEXT,
        subcategory TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    analyticsDb.exec('DELETE FROM operations_mart')

    // Process work orders
    const workOrderQuery = `
      SELECT payload_json
      FROM raw_report_work_order
    `

    // Process unit turn details
    const unitTurnQuery = `
      SELECT payload_json  
      FROM raw_report_unit_turn_detail
    `

    const workOrders = analyticsDb.prepare(workOrderQuery).all() as any[]
    const unitTurns = analyticsDb.prepare(unitTurnQuery).all() as any[]

    const insertStmt = analyticsDb.prepare(`
      INSERT INTO operations_mart (
        id, property_id, unit_id, work_order_type, status, 
        created_date, completed_date, description, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let recordsProcessed = 0

    // Process work orders
    for (const record of workOrders) {
      const data = JSON.parse(record.payload_json as string)
      insertStmt.run(
        `wo_${recordsProcessed}`,
        data.PropertyId || null,
        data.UnitId || null,
        'Work Order',
        data.Status || 'Unknown',
        data.CreatedDate || data.DateCreated || null,
        data.CompletedDate || data.DateCompleted || null,
        data.Description || data.Summary || '',
        'Maintenance'
      )
      recordsProcessed++
    }

    // Process unit turns
    for (const record of unitTurns) {
      const data = JSON.parse(record.payload_json as string)
      insertStmt.run(
        `ut_${recordsProcessed}`,
        data.PropertyId || null,
        data.UnitId || null,
        'Unit Turn',
        data.Status || 'Unknown',
        data.StartDate || null,
        data.CompletedDate || null,
        'Unit turnover process',
        'Unit Turns'
      )
      recordsProcessed++
    }

    const duration = Date.now() - startTime
    console.log(`[ANALYTICS_BUILDER] ✅ Operations Mart built: ${recordsProcessed} records in ${duration}ms`)
    
    return { success: true, recordsProcessed, duration }

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ANALYTICS_BUILDER] ❌ Error building Operations Mart:', error)
    return { success: false, recordsProcessed: 0, duration, error: errorMessage }
  }
}

export async function buildForecastViews(): Promise<{ success: boolean; recordsProcessed: number; duration: number; error?: string }> {
  const startTime = Date.now()
  console.log('[ANALYTICS_BUILDER] Building Forecast Views...')
  
  try {
    // Create forecast views table
    analyticsDb.exec(`
      CREATE TABLE IF NOT EXISTS forecast_views (
        id TEXT PRIMARY KEY,
        forecast_date DATE,
        property_id TEXT,
        metric_name TEXT,
        metric_category TEXT,
        forecast_value REAL,
        actual_value REAL,
        variance REAL,
        confidence_level REAL,
        model_type TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    analyticsDb.exec('DELETE FROM forecast_views')

    // Generate basic occupancy and revenue forecasts
    const occupancyQuery = `
      SELECT 
        property_id,
        COUNT(*) as total_units,
        SUM(CASE WHEN is_occupied THEN 1 ELSE 0 END) as occupied_units,
        AVG(current_rent) as avg_rent
      FROM units_leasing_master
      GROUP BY property_id
    `

    const occupancyData = analyticsDb.prepare(occupancyQuery).all() as any[]

    const insertStmt = analyticsDb.prepare(`
      INSERT INTO forecast_views (
        id, forecast_date, property_id, metric_name, metric_category,
        forecast_value, confidence_level, model_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let recordsProcessed = 0
    const forecastDate = new Date().toISOString().split('T')[0]

    for (const property of occupancyData) {
      const propertyData = property as any
      const occupancyRate = (propertyData.occupied_units / propertyData.total_units) * 100
      const projectedRevenue = propertyData.occupied_units * propertyData.avg_rent

      // Occupancy forecast
      insertStmt.run(
        `occ_${propertyData.property_id}`,
        forecastDate,
        propertyData.property_id,
        'Occupancy Rate',
        'Leasing',
        occupancyRate,
        85.0, // 85% confidence level
        'Historical Average'
      )
      recordsProcessed++

      // Revenue forecast
      insertStmt.run(
        `rev_${propertyData.property_id}`,
        forecastDate,
        propertyData.property_id,
        'Monthly Revenue',
        'Financial',
        projectedRevenue,
        80.0, // 80% confidence level  
        'Linear Projection'
      )
      recordsProcessed++
    }

    const duration = Date.now() - startTime
    console.log(`[ANALYTICS_BUILDER] ✅ Forecast Views built: ${recordsProcessed} records in ${duration}ms`)
    
    return { success: true, recordsProcessed, duration }

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ANALYTICS_BUILDER] ❌ Error building Forecast Views:', error)
    return { success: false, recordsProcessed: 0, duration, error: errorMessage }
  }
}

function updateAnalyticsMetaSnapshot(totalRecords: number): void {
  const now = new Date().toISOString()
  
  // Insert or update analytics_meta record
  const stmt = analyticsDb.prepare(`
    INSERT OR REPLACE INTO analytics_meta (id, last_snapshot_at, total_rows)
    VALUES (1, ?, ?)
  `)
  
  stmt.run(now, totalRecords)
  console.log(`[ANALYTICS_BUILDER] Updated analytics_meta.last_snapshot_at to ${now}`)
}