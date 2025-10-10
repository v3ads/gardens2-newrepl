'use client'

import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Building2, DollarSign, Wrench, LineChart, RefreshCw, Loader2, Settings } from 'lucide-react'
import { useAnalytics } from '@/contexts/analytics-context'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AnalyticsLoadingState } from '@/components/analytics-skeletons'
import { AnalyticsEmptyState } from '@/components/analytics-empty-state'
import { OccupancyKPICards } from '@/components/occupancy-kpi-cards'
import { OperationalKPICards } from '@/components/operational-kpi-cards'
import { OccupancyKPIs } from '@/lib/occupancy-analytics'
import { OperationalKPIs } from '@/components/operational-kpi-cards'
import { toast } from 'sonner'

const analyticsCategories = [
  {
    key: 'occupancy',
    title: 'Occupancy & Leasing',
    description: 'Rates, vacancy days, move‑ins/outs, expirations, renewals.',
    icon: Building2,
  },
  {
    key: 'financial',
    title: 'Financial',
    description: 'MRR, MoM growth, ARPU, vacancy loss, collections.',
    icon: DollarSign,
  },
  {
    key: 'operations',
    title: 'Operational Efficiency',
    description: 'Turnover %, make‑ready cycle, maintenance‑linked vacancy.',
    icon: Wrench,
  },
  {
    key: 'forecasts',
    title: 'Forecasts & Insights',
    description: 'Occupancy & MRR projections, seasonality, churn risk.',
    icon: LineChart,
  },
]

export default function AnalyticsCategoryPage() {
  const router = useRouter()
  const params = useParams()
  const categoryKey = params.category as string
  const { setSelectedCategory } = useAnalytics()

  // State management
  const [isLoading, setIsLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [occupancyKPIs, setOccupancyKPIs] = useState<OccupancyKPIs | null>(null)
  const [operationalKPIs, setOperationalKPIs] = useState<OperationalKPIs | null>(null)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [showDevControls, setShowDevControls] = useState(false)
  const [showNoCoverageWarning, setShowNoCoverageWarning] = useState(false)

  // Check if dev mode
  const isDev = process.env.NODE_ENV === 'development'

  // Find current category
  const category = analyticsCategories.find(cat => cat.key === categoryKey)

  useEffect(() => {
    if (categoryKey) {
      setSelectedCategory(categoryKey)
      loadData()
    }
  }, [categoryKey, setSelectedCategory])

  // Load data based on category
  const loadData = async () => {
    setIsLoading(true)
    try {
      if (categoryKey === 'occupancy') {
        await loadOccupancyKPIs()
      } else if (categoryKey === 'operations') {
        await loadOperationalKPIs()
      } else {
        // For financial and forecasts, show generic dashboard
        setHasData(true)
      }
    } catch (error) {
      console.error('Error loading analytics data:', error)
      setHasData(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Rebuild analytics (dev only)
  const handleRebuild = async () => {
    setIsRebuilding(true)
    try {
      const response = await fetch('/api/occupancy/rebuild', { 
        method: 'POST',
        cache: 'no-store'
      })
      if (response.ok) {
        toast.success('Analytics rebuilt successfully')
        await loadData()
      } else {
        toast.error('Failed to rebuild analytics')
      }
    } catch (error) {
      toast.error('Error during rebuild')
      console.error('Rebuild error:', error)
    } finally {
      setIsRebuilding(false)
    }
  }

  // Load operational KPIs
  const loadOperationalKPIs = async () => {
    try {
      const timestamp = Date.now()
      const response = await fetch(`/api/analytics/operational?t=${timestamp}`, {
        cache: 'no-store',
        headers: { 
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // Map the structured API response to match our component interface
          // Use base metrics (real AppFolio data) and advanced metrics (null when not available)
          const base = data.data.base || {}
          const advanced = data.data.advanced || {}
          
          const mappedData: OperationalKPIs = {
            // Base metrics from AppFolio (real data)
            turnoverRate12Mo: base.turnoverRate12Mo || 0,
            
            // Advanced metrics (null when not available, 0 only if explicitly 0)
            avgMakeReadyDays: advanced.avgMakeReadyDays,
            avgLeaseUpDays: advanced.avgLeaseUpDays, 
            workOrderBacklog: advanced.workOrderBacklog,
            avgWorkOrderAge: advanced.avgWorkOrderAge,
            slaComplianceRate: advanced.slaCompliance,
            firstPassFixRate: advanced.firstPassFixRate,
            preventiveMaintenanceRate: advanced.preventiveMaintenanceCompliance,
            avgTurnCost: advanced.avgTurnCostPerUnit,
            maintenanceLinkedVacancies: advanced.maintenanceLinkedVacancyDays,
            workOrdersPerUnit30d: advanced.workOrdersPerOccupiedUnit30d,
            
            // Metadata
            snapshotDate: data.data.snapshotDate || new Date().toISOString().split('T')[0]
          }
          setOperationalKPIs(mappedData)
          setHasData(true)
        } else {
          setOperationalKPIs(null)
          setHasData(false)
        }
      } else {
        console.error('Failed to load operational KPIs:', response.statusText)
        setOperationalKPIs(null)
        setHasData(false)
      }
    } catch (error) {
      console.error('Error loading operational KPIs:', error)
      setOperationalKPIs(null)
      setHasData(false)
    }
  }

  // Load occupancy KPIs - hybrid approach for best data
  const loadOccupancyKPIs = async () => {
    try {
      // Add timestamp for aggressive cache busting
      const timestamp = Date.now()
      // Fetch from both APIs to get complete data
      const [newApiResponse, oldApiResponse] = await Promise.all([
        fetch(`/api/analytics/occupancy/kpis?t=${timestamp}`, {
          cache: 'no-store',
          headers: { 
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }),
        fetch(`/api/occupancy/kpis?asOf=latest&t=${timestamp}`, {
          cache: 'no-store',
          headers: { 
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
      ])

      const newData = await newApiResponse.json()
      const oldApiRaw = await oldApiResponse.json()

      // Extract data from old API response wrapper
      const oldData = oldApiRaw.success ? oldApiRaw.data : oldApiRaw

      if (newData.total_units !== undefined) {
        // Combine data: use new API for unit counts, old API for student/non-student breakdowns
        const occupancyKPIs: OccupancyKPIs = {
          total_units: newData.total_units,
          occupied_units: newData.occupied_units,
          vacant_units: newData.vacant_units,
          occupancy_rate_pct: newData.occupancy_rate,
          // Use old API for detailed breakdowns if available
          // Use old API for detailed breakdowns if available
          occupancy_student: oldData.student_occupancy_rate || 0,
          occupancy_non_student: oldData.non_student_occupancy_rate || 0,
          move_ins_mtd: 0,
          move_outs_mtd: 0,
          expirations_30: 0,
          expirations_60: 0,
          expirations_90: 0,
          snapshot_date: newData.snapshot_date || oldData.snapshot_date
        }
        
        setOccupancyKPIs(occupancyKPIs)
        setHasData(true)
        setShowNoCoverageWarning(false)
      } else if (oldData.total_units !== undefined) {
        // Fallback to old API data only
        const occupancyKPIs: OccupancyKPIs = {
          total_units: oldData.total_units,
          occupied_units: oldData.occupied_units,
          vacant_units: oldData.vacant_units,
          occupancy_rate_pct: oldData.occupancy_rate,
          occupancy_student: oldData.student_occupancy_rate || 0,
          occupancy_non_student: oldData.non_student_occupancy_rate || 0,
          move_ins_mtd: 0,
          move_outs_mtd: 0,
          expirations_30: 0,
          expirations_60: 0,
          expirations_90: 0,
          snapshot_date: oldData.snapshot_date
        }
        
        setOccupancyKPIs(occupancyKPIs)
        setHasData(true)
        setShowNoCoverageWarning(false)
      } else {
        console.log('No occupancy data available from either API')
        setOccupancyKPIs(null)
        setHasData(false)
        setShowNoCoverageWarning(false)
      }
    } catch (error) {
      console.error('Error loading occupancy KPIs:', error)
      setOccupancyKPIs(null)
      setShowNoCoverageWarning(true)
    }
  }


  if (!category) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/analytics')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Analytics</span>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Category Not Found</CardTitle>
            <CardDescription>
              The requested analytics category does not exist.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const IconComponent = category.icon

  return (
    <div className="space-y-6">
      {/* Breadcrumb and Back Navigation */}
      <div className="space-y-3">
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span 
            className="hover:text-primary cursor-pointer transition-colors"
            onClick={() => router.push('/overview')}
          >
            Home
          </span>
          <span>/</span>
          <span 
            className="hover:text-primary cursor-pointer transition-colors"
            onClick={() => router.push('/analytics')}
          >
            Analytics
          </span>
          <span>/</span>
          <span className="text-foreground font-medium">{category.title}</span>
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/analytics')}
            className="flex items-center space-x-2 w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Analytics</span>
            <span className="sm:hidden">Back</span>
          </Button>
          {isDev && categoryKey === 'occupancy' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDevControls(!showDevControls)}
              className="flex items-center space-x-2 w-fit"
            >
              <Settings className="h-4 w-4" />
              <span>Dev Controls</span>
            </Button>
          )}
        </div>
      </div>

      {/* Category Header */}
      <div className="space-y-4">
        <div className="flex items-center space-x-4">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <IconComponent className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{category.title}</h1>
            <p className="text-muted-foreground mt-1">{category.description}</p>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="grid gap-6">
        {isLoading ? (
          <div className="space-y-4">
            <AnalyticsLoadingState />

          </div>
        ) : hasData ? (
          // Show actual KPI cards for occupancy and operations, generic dashboard for others
          categoryKey === 'occupancy' && occupancyKPIs ? (
            <div className="space-y-6">
              {/* Dev Controls */}
              {isDev && showDevControls && (
                <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
                  <CardHeader>
                    <CardTitle className="text-yellow-800 dark:text-yellow-200">Dev Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRebuild}
                        disabled={isRebuilding}
                        className="flex items-center space-x-2"
                      >
                        {isRebuilding ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        <span>{isRebuilding ? 'Rebuilding...' : 'Rebuild Analytics'}</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              <OccupancyKPICards kpis={occupancyKPIs} />
            </div>
          ) : categoryKey === 'operations' && operationalKPIs ? (
            <OperationalKPICards kpis={operationalKPIs} />
          ) : (
            // Generic dashboard for financial and forecasts
            <Card>
              <CardHeader>
                <CardTitle>{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-12">
                <IconComponent className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
                <p className="text-muted-foreground">
                  {category.title} analytics are in development and will be available soon.
                </p>
              </CardContent>
            </Card>
          )
        ) : (
          <AnalyticsEmptyState 
            category={category.title}
            isConnected={true}
          />
        )}
      </div>
    </div>
  )
}