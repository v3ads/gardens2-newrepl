// AppFolio Reports Registry
// Official report IDs from AppFolio API documentation

export interface AppFolioReportConfig {
  id: string
  name: string
  description: string
  category: 'financial' | 'leasing' | 'operations' | 'maintenance' | 'accounting'
  enabled: boolean
  defaultParams?: Record<string, string>
  requiresDateRange?: boolean
}

export const APPFOLIO_REPORTS_REGISTRY: AppFolioReportConfig[] = [
  // FINANCIAL REPORTS - All official endpoints from AppFolio documentation
  {
    id: 'rent_roll',
    name: 'Rent Roll',
    description: 'Current rent roll with tenant and lease information',
    category: 'financial',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'rent_roll_itemized',
    name: 'Rent Roll (Itemized)',
    description: 'Detailed rent roll with itemized charges',
    category: 'financial',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'cash_flow',
    name: 'Cash Flow',
    description: 'Property cash flow analysis',
    category: 'financial',
    enabled: true,
    requiresDateRange: true,
    defaultParams: {
      accounting_basis: 'cash'
    }
  },
  {
    id: 'income_statement',
    name: 'Income Statement',
    description: 'Property income and expense statement',
    category: 'financial',
    enabled: true,
    requiresDateRange: true,
    defaultParams: {
      accounting_basis: 'accrual'
    }
  },
  {
    id: 'balance_sheet',
    name: 'Balance Sheet',
    description: 'Property balance sheet',
    category: 'financial',
    enabled: true,
    requiresDateRange: false,
    defaultParams: {
      accounting_basis: 'accrual'
    }
  },
  {
    id: 'delinquency',
    name: 'Delinquency Report',
    description: 'Outstanding balances and delinquent accounts',
    category: 'financial',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'aged_receivables_detail',
    name: 'Aged Receivables Detail',
    description: 'Detailed aging of outstanding receivables',
    category: 'financial',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'twelve_month_cash_flow',
    name: 'Twelve Month Cash Flow',
    description: 'Twelve month rolling cash flow analysis',
    category: 'financial',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'twelve_month_income_statement',
    name: 'Twelve Month Income Statement',
    description: 'Twelve month rolling income statement',
    category: 'financial',
    enabled: true,
    requiresDateRange: false
  },

  // LEASING & OPERATIONS REPORTS
  {
    id: 'lease_history',
    name: 'Lease History',
    description: 'Historical lease data and changes',
    category: 'leasing',
    enabled: true,
    requiresDateRange: true
  },
  {
    id: 'lease_expiration_detail',
    name: 'Lease Expiration Detail',
    description: 'Upcoming lease expirations by month',
    category: 'leasing',
    enabled: true,
    requiresDateRange: true
  },
  {
    id: 'unit_vacancy',
    name: 'Unit Vacancy',
    description: 'Unit vacancy status with days vacant and last move-out dates',
    category: 'leasing',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'rental_applications',
    name: 'Rental Applications',
    description: 'Prospective tenant rental applications',
    category: 'leasing',
    enabled: true,
    requiresDateRange: true
  },
  {
    id: 'unit_turn_detail',
    name: 'Unit Turn Detail',
    description: 'Unit turnover and preparation details',
    category: 'operations',
    enabled: true,
    requiresDateRange: true
  },
  {
    id: 'renewal_summary',
    name: 'Renewal Summary',
    description: 'Lease renewal tracking and summary',
    category: 'leasing',
    enabled: true,
    requiresDateRange: true
  },

  // DIRECTORY & REFERENCE REPORTS
  {
    id: 'unit_directory',
    name: 'Unit Directory',
    description: 'Complete directory of all units',
    category: 'operations',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'tenant_directory',
    name: 'Tenant Directory',
    description: 'Complete directory of all tenants',
    category: 'operations',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'property_directory',
    name: 'Property Directory',
    description: 'Complete directory of all properties',
    category: 'operations',
    enabled: true,
    requiresDateRange: false
  },
  {
    id: 'owner_directory',
    name: 'Owner Directory',
    description: 'Complete directory of all property owners',
    category: 'operations',
    enabled: true,
    requiresDateRange: false
  },

  // MAINTENANCE & WORK ORDERS
  {
    id: 'work_order',
    name: 'Work Orders',
    description: 'Maintenance work orders and status',
    category: 'maintenance',
    enabled: true,
    requiresDateRange: true
  },
  {
    id: 'vendor_directory',
    name: 'Vendor Directory',
    description: 'Complete directory of vendors and service providers',
    category: 'maintenance',
    enabled: true,
    requiresDateRange: false
  },

  // ACCOUNTING REPORTS
  {
    id: 'general_ledger',
    name: 'General Ledger',
    description: 'Complete general ledger transactions',
    category: 'accounting',
    enabled: true,
    requiresDateRange: true,
    defaultParams: {
      accounting_basis: 'accrual'
    }
  },
  {
    id: 'trial_balance',
    name: 'Trial Balance',
    description: 'Trial balance of all accounts',
    category: 'accounting',
    enabled: true,
    requiresDateRange: false,
    defaultParams: {
      accounting_basis: 'accrual'
    }
  },
  {
    id: 'chart_of_accounts',
    name: 'Chart of Accounts',
    description: 'Complete chart of accounts',
    category: 'accounting',
    enabled: true,
    requiresDateRange: false
  },

  // ADDITIONAL USEFUL REPORTS
  {
    id: 'charge_detail',
    name: 'Charge Detail',
    description: 'Detailed breakdown of all charges',
    category: 'financial',
    enabled: true,
    requiresDateRange: true
  },
  {
    id: 'receivables_activity',
    name: 'Receivables Activity',
    description: 'Activity on tenant receivables',
    category: 'financial',
    enabled: true,
    requiresDateRange: true
  },
  {
    id: 'prospect_source_tracking',
    name: 'Prospect Source Tracking',
    description: 'Track sources of prospective tenants',
    category: 'leasing',
    enabled: true,
    requiresDateRange: true
  },

  // OPTIONAL REPORTS (for diagnostic purposes)
  {
    id: 'gross_potential_rent_enhanced',
    name: 'Gross Potential Rent (Enhanced)',
    description: 'Enhanced gross potential rent analysis with detailed breakdowns',
    category: 'financial',
    enabled: false, // Not yet implemented
    requiresDateRange: true
  },
  {
    id: 'screening_decisions',
    name: 'Screening Decisions',
    description: 'Tenant screening and application decision tracking',
    category: 'leasing',
    enabled: false, // Not yet implemented
    requiresDateRange: true
  },
  {
    id: 'guest_cards',
    name: 'Guest Cards',
    description: 'Guest card and prospect information (alternative to screening decisions)',
    category: 'leasing',
    enabled: true, // Available as fallback
    requiresDateRange: true
  }
]

// Helper functions
export function getEnabledReports(): AppFolioReportConfig[] {
  return APPFOLIO_REPORTS_REGISTRY.filter(report => report.enabled)
}

export function getReportById(id: string): AppFolioReportConfig | undefined {
  return APPFOLIO_REPORTS_REGISTRY.find(report => report.id === id)
}

export function getReportsByCategory(category: AppFolioReportConfig['category']): AppFolioReportConfig[] {
  return APPFOLIO_REPORTS_REGISTRY.filter(report => report.category === category && report.enabled)
}

// Default date range for reports that require it
export function getDefaultDateRange(): { from_date: string; to_date: string } {
  const now = new Date()
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDayThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  
  return {
    from_date: firstDayThisMonth.toISOString().split('T')[0],
    to_date: lastDayThisMonth.toISOString().split('T')[0]
  }
}