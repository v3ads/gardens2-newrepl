import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('[API] Analytics KPIs endpoint called');
    
    // Use latest snapshot date from master tenant data
    const snapshotDate = new Date().toISOString().split('T')[0]; // Current date as snapshot
    console.log('[API] Latest snapshot date:', snapshotDate);

    // Import functions directly to avoid dynamic server usage
    const { getLatestKPI } = await import('@/lib/occupancy-kpi-repository');
    const { FinancialAnalytics } = await import('@/lib/financial-analytics');
    
    // Get occupancy KPIs directly
    const occupancyData = await getLatestKPI('portfolio') || {};

    // Get financial KPIs directly
    const financialData = await FinancialAnalytics.getFinancialMetrics() || {};

    const response = {
      snapshotDate,
      occupancy: occupancyData,
      financial: financialData,
      lastUpdated: new Date().toISOString()
    };

    console.log('[API] Analytics KPIs response prepared');
    return NextResponse.json(response);

  } catch (error) {
    console.error('[API] Analytics KPIs error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch analytics KPIs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}