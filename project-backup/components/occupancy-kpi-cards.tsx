'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, Calendar, TrendingUp, ArrowUpRight, ArrowDownRight, Clock, AlertTriangle } from 'lucide-react'
import { OccupancyKPIs, AvgVacancyDaysKPI, MoveInsMTDKPI, MoveOutsMTDKPI, ExpiringUnitsKPI } from '@/lib/occupancy-analytics'
import { useEffect, useState } from 'react'

interface OccupancyKPICardsProps {
  kpis: OccupancyKPIs
}

// Animated counter component
const AnimatedCounter = ({ value, suffix = '', duration = 1000 }: { value: number, suffix?: string, duration?: number }) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let start = 0
    const end = parseInt(value.toString())
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

  return <span>{count}{suffix}</span>
}

// Circular progress ring component - Mobile optimized
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
        {/* Background circle */}
        <circle
          stroke={backgroundColor}
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
          opacity="0.3"
        />
        {/* Progress circle */}
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
        <span className="text-sm sm:text-base font-bold text-shadow">{percentage}%</span>
      </div>
    </div>
  )
}

// Mini bar chart component - Enhanced for mobile
const MiniBarChart = ({ value, max, color = '#3b82f6' }: { value: number, max: number, color?: string }) => {
  const percentage = Math.min((value / max) * 100, 100)
  
  return (
    <div className="w-full bg-gray-300 rounded-full h-3 mt-3 shadow-inner">
      <div 
        className="h-3 rounded-full transition-all duration-1500 ease-out shadow-sm"
        style={{ 
          width: `${percentage}%`,
          background: `linear-gradient(90deg, ${color}60, ${color})`
        }}
      />
    </div>
  )
}

// Average Vacancy Days Card using provided KPI data
const AvgVacancyDaysCard = ({ kpis }: { kpis: OccupancyKPIs }) => {
  // Use the data from parent component instead of making separate API calls

  const isFullyOccupied = kpis.vacant_units === 0
  const displayValue = isFullyOccupied ? 0 : (kpis.avg_vacancy_days || 0)
  const targetDays = 60
  const progressPercentage = Math.min((displayValue / targetDays) * 100, 100)

  return (
    <Card className="bg-card border-2 border-border shadow-lg transition-all hover:shadow-xl hover:scale-105">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Average Vacancy Days
        </CardTitle>
        <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-2 text-foreground">
          <AnimatedCounter value={displayValue} suffix=" days" />
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {isFullyOccupied 
            ? "✅ All units occupied" 
            : `${kpis.vacant_units} vacant units analyzed`
          }
        </div>
        
        {/* Progress bar showing actual days vs target with better context */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-amber-600 dark:text-amber-400">Current: {displayValue} days</span>
            <span className="text-muted-foreground">Target: ≤{targetDays} days</span>
          </div>
          <div className="w-full bg-muted rounded-full h-4 shadow-inner relative">
            <div 
              className="h-4 rounded-full transition-all duration-1500 ease-out shadow-sm bg-gradient-to-r from-amber-500 to-orange-500 relative"
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            />
            {displayValue > targetDays && (
              <div className="absolute right-0 top-0 h-4 w-1 bg-red-500 rounded-r-full" />
            )}
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {displayValue > targetDays 
              ? `${Math.round(displayValue - targetDays)} days over target`
              : displayValue > 0 
                ? `${Math.round(targetDays - displayValue)} days under target`
                : "On target"
            }
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground mt-2">
          Updated {new Date(kpis.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// Move-Ins This Month Card using provided KPI data
const MoveInsMTDCard = ({ kpis }: { kpis: OccupancyKPIs }) => {
  // Use the data from parent component instead of making separate API calls

  const move_ins_mtd = kpis.move_ins_mtd || 0
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
  
  // Simplified without trend comparison (data not available in main KPI endpoint)
  const trendText = 'New residents'

  return (
    <Card className="bg-card border-2 border-border shadow-lg transition-all hover:shadow-xl hover:scale-105">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Move-Ins This Month
        </CardTitle>
        <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-2 text-foreground">
          <AnimatedCounter value={move_ins_mtd} />
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {move_ins_mtd === 0 ? 'No units moved in' : (kpis as any).move_ins_units?.join(', ') || 'Units moved in'}
        </div>
        
        <div className="text-xs text-muted-foreground mb-2">
          {monthName} month-to-date
        </div>
        
        {/* Mini bar chart */}
        <div className="space-y-2">
          <div className="w-full bg-muted rounded-full h-4 shadow-inner">
            <div 
              className="h-4 rounded-full transition-all duration-1500 ease-out shadow-sm bg-gradient-to-r from-green-500 to-emerald-500"
              style={{ width: `${Math.min((move_ins_mtd / Math.max(move_ins_mtd, 20)) * 100, 100)}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {move_ins_mtd === 0 ? 'No move-ins yet' : `${move_ins_mtd} new residents`}
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground mt-2">
          Updated {new Date(kpis.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// Move-Outs This Month Card using provided KPI data
const MoveOutsMTDCard = ({ kpis }: { kpis: OccupancyKPIs }) => {
  // Use the data from parent component instead of making separate API calls

  // Use provided KPI data directly

  const move_outs_mtd = kpis.move_outs_mtd || 0
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
  
  // Simplified without trend comparison
  const trendText = 'Departures'

  // Neutral styling for zero move-outs
  const isZero = move_outs_mtd === 0

  return (
    <Card className="bg-card border-2 border-border shadow-lg transition-all hover:shadow-xl hover:scale-105">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Move-Outs This Month
        </CardTitle>
        <div className={`p-2 rounded-full ${isZero ? 'bg-gray-100 dark:bg-gray-800' : 'bg-red-100 dark:bg-red-900/30'}`}>
          <ArrowDownRight className={`h-5 w-5 ${isZero ? 'text-gray-600 dark:text-gray-400' : 'text-red-600 dark:text-red-400'}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-2 text-foreground">
          <AnimatedCounter value={move_outs_mtd} />
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {move_outs_mtd === 0 ? 'No units departing' : (kpis as any).move_outs_units?.join(', ') || 'Units departing'}
        </div>
        
        <div className="text-xs text-muted-foreground mb-2">
          {monthName} month-to-date
        </div>
        
        {/* Mini bar chart */}
        <div className="space-y-2">
          <div className="w-full rounded-full h-4 shadow-inner bg-muted">
            <div 
              className={`h-4 rounded-full transition-all duration-1500 ease-out shadow-sm ${
                isZero ? 'bg-gradient-to-r from-gray-400 to-gray-500' : 'bg-gradient-to-r from-red-500 to-pink-500'
              }`}
              style={{ width: `${Math.min((move_outs_mtd / Math.max(move_outs_mtd, 10)) * 100, 100)}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {move_outs_mtd === 0 ? 'No departures yet' : `${move_outs_mtd} departures`}
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground mt-2">
          Updated {new Date(kpis.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// Expiring in 30 Days Card with real-time data
const ExpiringIn30DaysCard = () => {
  const [expiringData, setExpiringData] = useState<ExpiringUnitsKPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchExpiringData = async () => {
      try {
        setLoading(true)
        const timestamp = Date.now()
        const response = await fetch(`/api/analytics/occupancy/expiring?asOf=latest&windows=separate&t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        
        const data = await response.json()
        setExpiringData(data)
        setError(null)
      } catch (err) {
        console.error('Error fetching expiring data:', err)
        setError('Failed to load data')
        setExpiringData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchExpiringData()
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchExpiringData()
    }, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card className="bg-card border-2 border-border shadow-lg animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Expiring in 30 Days
          </CardTitle>
          <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-1 text-foreground">
            Loading...
          </div>
          <div className="text-xs text-muted-foreground">
            Fetching expiring leases
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !expiringData) {
    return (
      <Card className="bg-card border-2 border-border shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Expiring in 30 Days
          </CardTitle>
          <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
            <AlertTriangle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-1 text-foreground">
            No data
          </div>
          <div className="text-xs text-muted-foreground">
            Expiring lease data unavailable
          </div>
        </CardContent>
      </Card>
    )
  }

  const { units } = expiringData
  const units30 = units.d30
  const count30 = units30.length

  return (
    <Card className="bg-card border-2 border-border shadow-lg transition-all hover:shadow-xl hover:scale-105">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Expiring in 30 Days
        </CardTitle>
        <div className={`p-2 rounded-full ${count30 > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
          <AlertTriangle className={`h-5 w-5 ${count30 > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-2 text-foreground">
          <AnimatedCounter value={count30} />
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {count30 === 0 ? 'No units expiring' : units30.join(', ')}
        </div>
        
        {/* Progress bar showing urgency */}
        <div className="space-y-2">
          <div className="w-full rounded-full h-4 shadow-inner bg-muted">
            <div 
              className={`h-4 rounded-full transition-all duration-1500 ease-out shadow-sm ${
                count30 === 0 ? 'bg-gradient-to-r from-gray-400 to-gray-500' : 'bg-gradient-to-r from-orange-500 to-red-500'
              }`}
              style={{ width: `${Math.min((count30 / Math.max(count30, 5)) * 100, 100)}%` }}
            />
          </div>

        </div>
        
        {expiringData.snapshot_date && (
          <div className="text-xs text-muted-foreground mt-2">
            Updated {new Date(expiringData.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Expiring in 60 Days Card with real-time data
const ExpiringIn60DaysCard = () => {
  const [expiringData, setExpiringData] = useState<ExpiringUnitsKPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchExpiringData = async () => {
      try {
        setLoading(true)
        const timestamp = Date.now()
        const response = await fetch(`/api/analytics/occupancy/expiring?asOf=latest&windows=separate&t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        
        const data = await response.json()
        setExpiringData(data)
        setError(null)
      } catch (err) {
        console.error('Error fetching expiring data:', err)
        setError('Failed to load data')
        setExpiringData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchExpiringData()
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchExpiringData()
    }, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card className="bg-card border-2 border-border shadow-lg animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Expiring in 60 Days
          </CardTitle>
          <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <Calendar className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-1 text-foreground">
            Loading...
          </div>
          <div className="text-xs text-muted-foreground">
            Fetching expiring leases
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !expiringData) {
    return (
      <Card className="bg-card border-2 border-border shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Expiring in 60 Days
          </CardTitle>
          <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
            <Calendar className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-1 text-foreground">
            No data
          </div>
          <div className="text-xs text-muted-foreground">
            Expiring lease data unavailable
          </div>
        </CardContent>
      </Card>
    )
  }

  const { units } = expiringData
  const units60 = units.d60
  const count60 = units60.length

  return (
    <Card className="bg-card border-2 border-border shadow-lg transition-all hover:shadow-xl hover:scale-105">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Expiring in 60 Days
        </CardTitle>
        <div className={`p-2 rounded-full ${count60 > 0 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
          <Calendar className={`h-5 w-5 ${count60 > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-400'}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-2 text-foreground">
          <AnimatedCounter value={count60} />
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {count60 === 0 ? 'No units expiring' : units60.join(', ')}
        </div>
        
        {/* Progress bar showing planning timeline */}
        <div className="space-y-2">
          <div className="w-full rounded-full h-4 shadow-inner bg-muted">
            <div 
              className={`h-4 rounded-full transition-all duration-1500 ease-out shadow-sm ${
                count60 === 0 ? 'bg-gradient-to-r from-gray-400 to-gray-500' : 'bg-gradient-to-r from-yellow-500 to-orange-500'
              }`}
              style={{ width: `${Math.min((count60 / Math.max(count60, 5)) * 100, 100)}%` }}
            />
          </div>

        </div>
        
        {expiringData.snapshot_date && (
          <div className="text-xs text-muted-foreground mt-2">
            Updated {new Date(expiringData.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Expiring in 90 Days Card with real-time data
const ExpiringIn90DaysCard = () => {
  const [expiringData, setExpiringData] = useState<ExpiringUnitsKPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchExpiringData = async () => {
      try {
        setLoading(true)
        const timestamp = Date.now()
        const response = await fetch(`/api/analytics/occupancy/expiring?asOf=latest&windows=separate&t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        
        const data = await response.json()
        setExpiringData(data)
        setError(null)
      } catch (err) {
        console.error('Error fetching expiring data:', err)
        setError('Failed to load data')
        setExpiringData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchExpiringData()
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchExpiringData()
    }, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card className="bg-card border-2 border-border shadow-lg animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Expiring in 90 Days
          </CardTitle>
          <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-1 text-foreground">
            Loading...
          </div>
          <div className="text-xs text-muted-foreground">
            Fetching expiring leases
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !expiringData) {
    return (
      <Card className="bg-card border-2 border-border shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Expiring in 90 Days
          </CardTitle>
          <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
            <Calendar className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-1 text-foreground">
            No data
          </div>
          <div className="text-xs text-muted-foreground">
            Expiring lease data unavailable
          </div>
        </CardContent>
      </Card>
    )
  }

  const { units } = expiringData
  const units90 = units.d90
  const count90 = units90.length

  return (
    <Card className="bg-card border-2 border-border shadow-lg transition-all hover:shadow-xl hover:scale-105">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Expiring in 90 Days
        </CardTitle>
        <div className={`p-2 rounded-full ${count90 > 0 ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
          <Calendar className={`h-5 w-5 ${count90 > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-2 text-foreground">
          <AnimatedCounter value={count90} />
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {count90 === 0 ? 'No units expiring' : units90.join(', ')}
        </div>
        
        {/* Progress bar showing long-term planning */}
        <div className="space-y-2">
          <div className="w-full rounded-full h-4 shadow-inner bg-muted">
            <div 
              className={`h-4 rounded-full transition-all duration-1500 ease-out shadow-sm ${
                count90 === 0 ? 'bg-gradient-to-r from-gray-400 to-gray-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
              }`}
              style={{ width: `${Math.min((count90 / Math.max(count90, 5)) * 100, 100)}%` }}
            />
          </div>

        </div>
        
        {expiringData.snapshot_date && (
          <div className="text-xs text-muted-foreground mt-2">
            Updated {new Date(expiringData.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function OccupancyKPICards({ kpis }: OccupancyKPICardsProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  // Enhanced KPI Card with visual elements
  const KPICard = ({ 
    title, 
    value, 
    icon: Icon, 
    suffix = '', 
    trend, 
    trendValue,
    className = '',
    showProgress = false,
    progressColor,
    showChart = false,
    chartMax,
    gradient = false
  }: {
    title: string
    value: number | string
    icon: any
    suffix?: string
    trend?: 'up' | 'down' | 'neutral'
    trendValue?: string
    className?: string
    showProgress?: boolean
    progressColor?: string
    showChart?: boolean
    chartMax?: number
    gradient?: boolean
  }) => {
    const numericValue = typeof value === 'string' ? parseFloat(value) || 0 : value
    
    return (
      <Card className={`transition-all hover:shadow-lg hover:scale-105 ${gradient ? 'bg-gradient-to-br from-white to-gray-50' : ''} ${className}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className={`text-sm font-medium ${className.includes('text-white') ? 'text-white/90' : 'text-muted-foreground'}`}>
            {title}
          </CardTitle>
          <div className={`p-2 rounded-full ${
            showProgress ? 'bg-transparent' : 'bg-gray-100'
          }`}>
            <Icon className={`h-5 w-5 ${
              className.includes('text-white') ? 'text-white/80' :
              trend === 'up' ? 'text-green-600' : 
              trend === 'down' ? 'text-red-600' : 
              'text-gray-600'
            }`} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-3xl font-bold mb-1">
                {typeof value === 'number' ? (
                  <AnimatedCounter value={numericValue} suffix={suffix} />
                ) : (
                  `${value}${suffix}`
                )}
              </div>
              {trend && trendValue && (
                <div className={`flex items-center text-xs ${
                  trend === 'up' ? 'text-green-600' : 
                  trend === 'down' ? 'text-red-600' : 
                  'text-muted-foreground'
                }`}>
                  {trend === 'up' && <ArrowUpRight className="h-3 w-3 mr-1" />}
                  {trend === 'down' && <ArrowDownRight className="h-3 w-3 mr-1" />}
                  {trendValue}
                </div>
              )}
            </div>
            {showProgress && suffix === '%' && (
              <div className="ml-4">
                <ProgressRing 
                  percentage={numericValue} 
                  color={progressColor || '#10b981'}
                  size={56}
                />
              </div>
            )}
          </div>
          {showChart && chartMax && (
            <MiniBarChart 
              value={numericValue} 
              max={chartMax}
              color={progressColor || '#3b82f6'}
            />
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero Occupancy Cards - Mobile Optimized */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Overall Occupancy - Full width on mobile */}
        <KPICard
          title="Overall Occupancy Rate"
          value={kpis.occupancy_rate_pct || kpis.occupancy_all || 0}
          suffix="%"
          icon={Building2}
          className="md:col-span-2 lg:col-span-2 bg-gradient-to-br from-cyan-600 via-blue-700 to-purple-800 text-white border-0 shadow-2xl ring-2 ring-cyan-400/50 hover:ring-cyan-300/70 transition-all duration-300"
          showProgress={true}
          progressColor="#ffffff"
          gradient={true}
        />
        
        {/* Student & Non-Student - Each on its own line */}
        <div className="space-y-4">
          <KPICard
            title="Student Occupancy"
            value={kpis.occupancy_student || 0}
            suffix="%"
            icon={Users}
            className="bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white border-0 shadow-xl ring-2 ring-pink-300/50 hover:ring-pink-200/70 transition-all duration-300 min-h-[120px]"
            showProgress={true}
            progressColor="#ffffff"
          />
          
          <KPICard
            title="Non-Student Occupancy"
            value={kpis.occupancy_non_student || 0}
            suffix="%"
            icon={Users}
            className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-green-500 text-white border-0 shadow-lg min-h-[120px]"
            showProgress={true}
            progressColor="#ffffff"
          />
        </div>
      </div>

      {/* Performance Metrics - Mobile Optimized */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <AvgVacancyDaysCard kpis={kpis} />
        
        <MoveInsMTDCard kpis={kpis} />
        
        <MoveOutsMTDCard kpis={kpis} />
      </div>

      {/* Lease Expirations - Real-time Cards - Mobile Optimized */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <ExpiringIn30DaysCard />
        
        <ExpiringIn60DaysCard />
        
        <ExpiringIn90DaysCard />
      </div>

      {/* Portfolio Summary with Visual Breakdown */}
      <Card className="bg-gradient-to-r from-gray-100 to-gray-200 border-2 border-gray-300 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-gray-800">🏢 Portfolio Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            <div className="text-center p-4 bg-gray-50 rounded-lg shadow-md">
              <div className="text-3xl font-bold text-gray-600 mb-2">
                <AnimatedCounter value={kpis.total_units} duration={1500} />
              </div>
              <div className="text-sm text-muted-foreground">Total Units</div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
                <div className="bg-gradient-to-r from-blue-400 to-purple-500 h-3 rounded-full w-full" />
              </div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg shadow-md">
              <div className="text-3xl font-bold text-green-600 mb-2">
                <AnimatedCounter value={kpis.occupied_units} duration={1500} />
              </div>
              <div className="text-sm text-muted-foreground">Occupied Units</div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-green-400 to-emerald-500 h-3 rounded-full transition-all duration-1000"
                  style={{ width: `${(kpis.occupied_units / kpis.total_units) * 100}%` }}
                />
              </div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg shadow-md">
              <div className="text-3xl font-bold text-red-500 mb-2">
                <AnimatedCounter value={kpis.vacant_units} duration={1500} />
              </div>
              <div className="text-sm text-muted-foreground">Vacant Units</div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-red-400 to-pink-500 h-3 rounded-full transition-all duration-1000"
                  style={{ width: `${(kpis.vacant_units / kpis.total_units) * 100}%` }}
                />
              </div>
            </div>
          </div>
          
          {/* Occupancy Visualization */}
          <div className="mt-6 p-4 bg-white rounded-lg shadow-md">
            <h4 className="text-sm font-medium text-gray-600 mb-3">Unit Distribution</h4>
            <div className="flex rounded-lg overflow-hidden h-4 shadow-inner">
              <div 
                className="bg-gradient-to-r from-green-400 to-green-500 transition-all duration-1000"
                style={{ width: `${(kpis.occupied_units / kpis.total_units) * 100}%` }}
                title={`Occupied: ${kpis.occupied_units} units`}
              />
              <div 
                className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-1000"
                style={{ width: `${(kpis.vacant_units / kpis.total_units) * 100}%` }}
                title={`Vacant: ${kpis.vacant_units} units`}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>💚 {kpis.occupied_units} Occupied ({(kpis.occupancy_rate_pct || kpis.occupancy_all || 0).toFixed(1)}%)</span>
              <span>❤️ {kpis.vacant_units} Vacant ({(100 - (kpis.occupancy_rate_pct || kpis.occupancy_all || 0)).toFixed(1)}%)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}