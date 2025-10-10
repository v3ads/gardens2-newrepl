'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Wrench, 
  DollarSign,
  Home,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Calendar
} from 'lucide-react'
import { useEffect, useState } from 'react'

export interface OperationalKPIs {
  turnoverRate12Mo: number
  avgMakeReadyDays: number | null
  avgLeaseUpDays: number | null
  workOrderBacklog: number | null
  avgWorkOrderAge: number | null
  slaComplianceRate: number | null
  firstPassFixRate: number | null
  preventiveMaintenanceRate: number | null
  avgTurnCost: number | null
  maintenanceLinkedVacancies: number | null
  workOrdersPerUnit30d: number | null
  snapshotDate: string
}

interface OperationalKPICardsProps {
  kpis: OperationalKPIs
}

// Animated counter component with null handling
const AnimatedCounter = ({ value, suffix = '', duration = 1000 }: { value: number | null, suffix?: string, duration?: number }) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (value === null || value === undefined) {
      setCount(0)
      return
    }
    
    // Safeguard against NaN values
    const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0
    let start = 0
    const end = parseInt(safeValue.toString())
    const increment = end / (duration / 16)
    
    const timer = setInterval(() => {
      start += increment
      if (start >= end) {
        setCount(end)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 16)

    return () => clearInterval(timer)
  }, [value, duration])

  // Handle null values
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">N/A</span>
  }

  return <span>{count}{suffix}</span>
}

// Progress ring component
const ProgressRing = ({ 
  percentage, 
  size = 64, 
  strokeWidth = 6, 
  color = '#10b981',
  backgroundColor = '#e5e7eb'
}: {
  percentage: number
  size?: number
  strokeWidth?: number
  color?: string
  backgroundColor?: string
}) => {
  const normalizedRadius = (size - strokeWidth) / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDasharray = `${circumference} ${circumference}`
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="relative flex items-center justify-center min-w-[64px]">
      <svg height={size} width={size} className="transform -rotate-90 drop-shadow-sm">
        <circle
          stroke={backgroundColor}
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
          opacity="0.3"
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          style={{ 
            strokeDashoffset,
            transition: 'stroke-dashoffset 1.2s ease-out',
            filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.1))'
          }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm sm:text-base font-bold">{percentage}%</span>
      </div>
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string | number | null
  description: string
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  colorScheme?: 'emerald' | 'red' | 'blue' | 'amber' | 'purple' | 'cyan'
  showProgress?: boolean
  progressValue?: number | null
  progressMax?: number
  isUnavailable?: boolean
}

const MetricCard = ({ 
  title, 
  value, 
  description, 
  icon, 
  trend, 
  colorScheme = 'blue',
  showProgress = false,
  progressValue = 0,
  progressMax = 100,
  isUnavailable = false
}: MetricCardProps) => {
  const colorClasses = {
    emerald: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20',
    red: 'border-red-200 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20',
    blue: 'border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20',
    amber: 'border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20',
    purple: 'border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20',
    cyan: 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20'
  }

  const iconColorClasses = {
    emerald: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    red: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    amber: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    cyan: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30'
  }

  const progressColors = {
    emerald: '#10b981',
    red: '#ef4444',
    blue: '#3b82f6',
    amber: '#f59e0b',
    purple: '#8b5cf6',
    cyan: '#06b6d4'
  }

  return (
    <Card className={`${colorClasses[colorScheme]} border-2 shadow-lg transition-all hover:shadow-xl hover:scale-105`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-full ${iconColorClasses[colorScheme]}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2 mb-2">
          <div className="text-2xl font-bold">
            {value === null || value === undefined ? (
              <span className="text-muted-foreground">N/A</span>
            ) : (
              <AnimatedCounter 
                value={typeof value === 'string' ? parseInt(value) || 0 : value} 
                suffix={typeof value === 'string' && value.includes('%') ? '%' : ''} 
              />
            )}
          </div>
          {trend && value !== null && value !== undefined && (
            <div className={`flex items-center text-xs ${
              trend === 'up' ? 'text-emerald-600' : 
              trend === 'down' ? 'text-red-600' : 
              'text-gray-600'
            }`}>
              {trend === 'up' && <TrendingUp className="w-3 h-3" />}
              {trend === 'down' && <TrendingDown className="w-3 h-3" />}
            </div>
          )}
        </div>
        
        {value === null || value === undefined ? (
          <p className="text-xs text-muted-foreground mb-2">
            {description} · <span className="italic">Requires additional data sources</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mb-2">{description}</p>
        )}
        
        {showProgress && value !== null && value !== undefined && progressValue !== null && progressValue !== undefined && (
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="h-2 rounded-full transition-all duration-1500 ease-out"
              style={{ 
                width: `${Math.min((progressValue / progressMax) * 100, 100)}%`,
                backgroundColor: progressColors[colorScheme]
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function OperationalKPICards({ kpis }: OperationalKPICardsProps) {
  return (
    <div className="space-y-8">
      {/* Turnover & Leasing Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-emerald-600" />
          Turnover & Leasing Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            title="Annual Turnover Rate"
            value={kpis.turnoverRate12Mo !== null ? `${kpis.turnoverRate12Mo.toFixed(1)}%` : null}
            description="Units turned over in past 12 months"
            icon={<TrendingUp className="w-4 h-4" />}
            colorScheme={kpis.turnoverRate12Mo > 25 ? 'red' : kpis.turnoverRate12Mo > 15 ? 'amber' : 'emerald'}
            trend={kpis.turnoverRate12Mo > 20 ? 'up' : 'neutral'}
          />
          <MetricCard
            title="Make-Ready Cycle"
            value={kpis.avgMakeReadyDays}
            description="Average days to prepare units"
            icon={<Wrench className="w-4 h-4" />}
            colorScheme={kpis.avgMakeReadyDays !== null && kpis.avgMakeReadyDays > 21 ? 'red' : kpis.avgMakeReadyDays !== null && kpis.avgMakeReadyDays > 14 ? 'amber' : 'emerald'}
            trend={kpis.avgMakeReadyDays !== null && kpis.avgMakeReadyDays > 21 ? 'up' : 'neutral'}
          />
          <MetricCard
            title="Lease-Up Time"
            value={kpis.avgLeaseUpDays}
            description="Average days vacant units stay on market"
            icon={<Home className="w-4 h-4" />}
            colorScheme={kpis.avgLeaseUpDays !== null && kpis.avgLeaseUpDays > 45 ? 'red' : kpis.avgLeaseUpDays !== null && kpis.avgLeaseUpDays > 30 ? 'amber' : 'emerald'}
            trend={kpis.avgLeaseUpDays !== null && kpis.avgLeaseUpDays > 45 ? 'up' : 'neutral'}
          />
        </div>
      </div>

      {/* Work Order Management Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Wrench className="w-5 h-5 mr-2 text-blue-600" />
          Work Order Management
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Work Order Backlog"
            value={kpis.workOrderBacklog}
            description="Open work orders requiring attention"
            icon={<AlertTriangle className="w-4 h-4" />}
            colorScheme={kpis.workOrderBacklog !== null && kpis.workOrderBacklog > 50 ? 'red' : kpis.workOrderBacklog !== null && kpis.workOrderBacklog > 20 ? 'amber' : 'blue'}
            trend={kpis.workOrderBacklog !== null && kpis.workOrderBacklog > 30 ? 'up' : 'neutral'}
          />
          <MetricCard
            title="Average Age"
            value={kpis.avgWorkOrderAge}
            description="Days since work orders were opened"
            icon={<Clock className="w-4 h-4" />}
            colorScheme={kpis.avgWorkOrderAge !== null && kpis.avgWorkOrderAge > 14 ? 'red' : kpis.avgWorkOrderAge !== null && kpis.avgWorkOrderAge > 7 ? 'amber' : 'blue'}
            trend={kpis.avgWorkOrderAge !== null && kpis.avgWorkOrderAge > 14 ? 'up' : 'neutral'}
          />
          <MetricCard
            title="SLA Compliance"
            value={kpis.slaComplianceRate !== null ? `${kpis.slaComplianceRate}%` : null}
            description="Work orders completed within SLA"
            icon={<CheckCircle className="w-4 h-4" />}
            colorScheme={kpis.slaComplianceRate !== null && kpis.slaComplianceRate < 70 ? 'red' : kpis.slaComplianceRate !== null && kpis.slaComplianceRate < 85 ? 'amber' : 'emerald'}
            showProgress={kpis.slaComplianceRate !== null}
            progressValue={kpis.slaComplianceRate}
            progressMax={100}
          />
          <MetricCard
            title="First-Pass Fix Rate"
            value={kpis.firstPassFixRate !== null ? `${kpis.firstPassFixRate}%` : null}
            description="Issues resolved on first visit"
            icon={<CheckCircle className="w-4 h-4" />}
            colorScheme={kpis.firstPassFixRate !== null && kpis.firstPassFixRate < 70 ? 'red' : kpis.firstPassFixRate !== null && kpis.firstPassFixRate < 85 ? 'amber' : 'emerald'}
            showProgress={kpis.firstPassFixRate !== null}
            progressValue={kpis.firstPassFixRate}
            progressMax={100}
          />
        </div>
      </div>

      {/* Maintenance & Cost Analytics Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <DollarSign className="w-5 h-5 mr-2 text-purple-600" />
          Maintenance & Cost Analytics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Preventive Maintenance"
            value={kpis.preventiveMaintenanceRate !== null ? `${kpis.preventiveMaintenanceRate}%` : null}
            description="Scheduled maintenance completion rate"
            icon={<Calendar className="w-4 h-4" />}
            colorScheme={kpis.preventiveMaintenanceRate !== null && kpis.preventiveMaintenanceRate < 70 ? 'red' : kpis.preventiveMaintenanceRate !== null && kpis.preventiveMaintenanceRate < 85 ? 'amber' : 'purple'}
            showProgress={kpis.preventiveMaintenanceRate !== null}
            progressValue={kpis.preventiveMaintenanceRate}
            progressMax={100}
          />
          <MetricCard
            title="Turn Cost per Unit"
            value={kpis.avgTurnCost !== null ? `$${kpis.avgTurnCost.toLocaleString()}` : null}
            description="Average cost per unit turnover"
            icon={<DollarSign className="w-4 h-4" />}
            colorScheme={kpis.avgTurnCost !== null && kpis.avgTurnCost > 3000 ? 'red' : kpis.avgTurnCost !== null && kpis.avgTurnCost > 2000 ? 'amber' : 'purple'}
            trend={kpis.avgTurnCost !== null && kpis.avgTurnCost > 2500 ? 'up' : 'neutral'}
          />
          <MetricCard
            title="Maintenance-Linked Vacancy"
            value={kpis.maintenanceLinkedVacancies}
            description="Days vacant due to maintenance issues"
            icon={<Home className="w-4 h-4" />}
            colorScheme={kpis.maintenanceLinkedVacancies !== null && kpis.maintenanceLinkedVacancies > 30 ? 'red' : kpis.maintenanceLinkedVacancies !== null && kpis.maintenanceLinkedVacancies > 15 ? 'amber' : 'purple'}
            trend={kpis.maintenanceLinkedVacancies !== null && kpis.maintenanceLinkedVacancies > 20 ? 'up' : 'neutral'}
          />
          <MetricCard
            title="WOs per Unit (30d)"
            value={kpis.workOrdersPerUnit30d !== null ? kpis.workOrdersPerUnit30d.toFixed(1) : null}
            description="Work orders per occupied unit"
            icon={<BarChart3 className="w-4 h-4" />}
            colorScheme={kpis.workOrdersPerUnit30d !== null && kpis.workOrdersPerUnit30d > 0.5 ? 'red' : kpis.workOrdersPerUnit30d !== null && kpis.workOrdersPerUnit30d > 0.3 ? 'amber' : 'cyan'}
            trend={kpis.workOrdersPerUnit30d !== null && kpis.workOrdersPerUnit30d > 0.4 ? 'up' : 'neutral'}
          />
        </div>
      </div>

      {/* Summary Card */}
      <Card className="border-2 border-dashed border-gray-300 bg-gray-50 dark:bg-gray-900">
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <BarChart3 className="w-5 h-5 mr-2" />
            Operational Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-emerald-600">{kpis.snapshotDate}</div>
              <div className="text-sm text-muted-foreground">Last Updated</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {(() => {
                  const validRates = [kpis.slaComplianceRate, kpis.firstPassFixRate, kpis.preventiveMaintenanceRate].filter(rate => rate !== null)
                  return validRates.length > 0 ? (validRates.reduce((sum, rate) => sum + rate!, 0) / validRates.length).toFixed(0) + '%' : 'N/A'
                })()}
              </div>
              <div className="text-sm text-muted-foreground">Overall Efficiency Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {(() => {
                  if (kpis.avgMakeReadyDays !== null && kpis.avgLeaseUpDays !== null) {
                    return (kpis.avgMakeReadyDays + kpis.avgLeaseUpDays).toFixed(0)
                  }
                  return 'N/A'
                })()}
              </div>
              <div className="text-sm text-muted-foreground">Total Turnover Days</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}