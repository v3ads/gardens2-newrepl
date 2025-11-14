'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, RefreshCw, Building2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { OccupancyKPICards } from '@/components/occupancy-kpi-cards'
import { useFreshData } from '@/hooks/use-fresh-data'
import { AnalyticsErrorState } from '@/components/analytics/AnalyticsErrorState'

// Client-side type definition to avoid server-side imports
interface OccupancyKPIs {
  snapshot_date: string
  occupancy_rate_pct: number
  occupied_units: number
  total_units: number
  vacant_units: number
  avg_vacancy_days: number | undefined
  move_ins_mtd: number
  move_outs_mtd: number
  expirations_30: number
  expirations_60: number
  expirations_90: number
}

export default function OccupancyPage() {
  const router = useRouter()
  const [kpis, setKPIs] = useState<OccupancyKPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)

  const fetchKPIs = async (retryCount = 0) => {
    const maxRetries = 3
    const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 5000) // Exponential backoff, max 5s
    
    try {
      setLoading(true)
      setError(null)
      
      console.log(`[OCCUPANCY_PAGE] Fetching KPIs (attempt ${retryCount + 1}/${maxRetries + 1})...`)
      
      // Ultra-aggressive cache busting
      const cacheBuster = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const url = `/api/analytics/occupancy/kpis?asOf=latest&t=${cacheBuster}&v=${performance.now()}`
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin', // Ensure authentication cookies are sent
        cache: 'no-store'
      })
      
      console.log(`[OCCUPANCY_PAGE] Response status: ${response.status} ${response.statusText}`)
      console.log(`[OCCUPANCY_PAGE] Response headers:`, Object.fromEntries(response.headers.entries()))
      
      if (!response.ok) {
        // Try to get detailed error info
        let errorData: any = {}
        let responseText = ''
        
        try {
          responseText = await response.text()
          console.log(`[OCCUPANCY_PAGE] Raw response text:`, responseText)
          errorData = JSON.parse(responseText)
        } catch (parseError) {
          console.error(`[OCCUPANCY_PAGE] Failed to parse error response:`, parseError)
          errorData = { error: 'parse_error', rawResponse: responseText }
        }
        
        const errorCode = errorData.error || 'unknown_error'
        const errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`
        
        // Retry on temporary server/network errors
        if (retryCount < maxRetries && [408, 429, 500, 502, 503, 504].includes(response.status)) {
          const jitter = Math.random() * 200 // Add small jitter to prevent thundering herd
          console.log(`[OCCUPANCY_PAGE] Retrying in ${backoffDelay + jitter}ms due to temporary error...`)
          setTimeout(() => fetchKPIs(retryCount + 1), backoffDelay + jitter)
          return
        }
        
        setError({ code: errorCode, message: errorMessage })
        return
      }
      
      const responseText = await response.text()
      console.log(`[OCCUPANCY_PAGE] Raw successful response:`, responseText)
      
      const data = JSON.parse(responseText)
      console.log('[OCCUPANCY_PAGE] Parsed API Response:', data)
      console.log('[OCCUPANCY_PAGE] Snapshot date:', data.snapshot_date)
      
      // Validate response structure
      if (!data.snapshot_date || data.total_units === undefined) {
        throw new Error('Invalid response structure: missing required fields')
      }
      
      setKPIs(data)
      console.log('[OCCUPANCY_PAGE] ✅ KPIs loaded successfully')
      
    } catch (err) {
      console.error(`[OCCUPANCY_PAGE] ❌ Error fetching occupancy KPIs (attempt ${retryCount + 1}):`, err)
      
      // Retry on network errors (but not parsing errors)
      if (retryCount < maxRetries && (err instanceof TypeError || (err as any).name === 'NetworkError')) {
        const jitter = Math.random() * 200
        console.log(`[OCCUPANCY_PAGE] Retrying in ${backoffDelay + jitter}ms due to network error...`)
        setTimeout(() => fetchKPIs(retryCount + 1), backoffDelay + jitter)
        return
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to load occupancy data'
      setError({ 
        code: 'network_error', 
        message: `${errorMessage}${retryCount > 0 ? ` (after ${retryCount + 1} attempts)` : ''}` 
      })
    } finally {
      // Only set loading to false if this is the final attempt or successful
      if (retryCount >= maxRetries) {
        setLoading(false)
      }
    }
  }

  // Use fresh data hook for auto-refresh
  const { createAutoRefresh } = useFreshData()
  
  useEffect(() => {
    const cleanup = createAutoRefresh(() => fetchKPIs(0), 30 * 1000) // 30 seconds
    return cleanup
  }, [])

  // Initial load
  useEffect(() => {
    console.log('[OCCUPANCY_PAGE] Component mounted, loading KPIs...')
    fetchKPIs(0)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        {/* Mobile-first title section - no text cut-off */}
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Occupancy & Leasing</h1>
            <p className="text-muted-foreground text-sm">
              Monitor occupancy rates, vacancy periods, and leasing activity across your properties.
            </p>
          </div>
        </div>
        
        {/* Back button positioned below title to prevent text cut-off */}
        <div className="flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/analytics')}
            className="hover:bg-muted w-fit"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Analytics
          </Button>
        </div>
      </div>

      {/* Data Dashboard */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Data Dashboard</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your occupancy & leasing analytics and insights
          </p>
        </CardHeader>
        <CardContent>
          {loading && !kpis ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">Loading occupancy data...</p>
              </div>
            </div>
          ) : error ? (
            <AnalyticsErrorState
              error={error.code}
              message={error.message}
              onRetry={fetchKPIs}
            />
          ) : kpis ? (
            <div className="space-y-6">
              <OccupancyKPICards kpis={kpis} />
              
              {/* Snapshot Date Display */}
              <div className="flex justify-center">
                <div className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  Data as of: {(() => {
                    // Handle date string parsing to avoid timezone issues
                    const dateStr = kpis.snapshot_date;
                    console.log('[DATE_DEBUG] Raw date string:', dateStr);
                    
                    // Parse YYYY-MM-DD directly to avoid timezone conversion
                    const [year, month, day] = dateStr.split('-').map(Number);
                    const date = new Date(year, month - 1, day); // month is 0-indexed
                    
                    console.log('[DATE_DEBUG] Parsed date:', date);
                    console.log('[DATE_DEBUG] Formatted result:', date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }));
                    
                    return date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    });
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No occupancy data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}