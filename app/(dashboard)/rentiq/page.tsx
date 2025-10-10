'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, RefreshCw, Download, DollarSign, Calendar, Building, TrendingUp, Save } from 'lucide-react'

interface RentIQUnit {
  unit: string
  market_rent: number
  suggested_rent: number
  days_vacant: number
  category: string
  min_threshold: number
  cap_applied: boolean
  pricing_tier: string
}

interface RentIQData {
  date: string
  summary: {
    total_units: number
    vacant_units: number
    units_with_suggestions: number
    average_suggested_rent: number
    total_potential_increase: number
    occupancy_rate: number
    target_occupancy: number
    units_needed_for_target: number
  }
  thresholds: Record<string, number>
  units: RentIQUnit[]
}

export default function RentIQPage() {
  const [rentiqData, setRentiqData] = useState<RentIQData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [thresholds, setThresholds] = useState<Record<string, number>>({})

  const fetchRentIQData = async (recalculate = false, retryCount = 0) => {
    try {
      setRefreshing(recalculate)
      
      // Add timeout and retry logic for better reliability
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(`/api/rentiq${recalculate ? '?recalculate=true' : ''}`, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      if (result.status === 'error') {
        throw new Error(result.error)
      }
      
      // Validate response structure
      if (!result.data || typeof result.data !== 'object') {
        throw new Error('Invalid API response: missing data object')
      }
      
      // Transform the API response to match our expected structure
      const transformedData = {
        date: result.data.date,
        summary: {
          total_units: result.data.total_units,
          vacant_units: result.data.total_units - result.data.occupied_units,
          units_with_suggestions: result.data.rentiq_units?.length || 0,
          average_suggested_rent: result.data.rentiq_units?.length > 0 
            ? result.data.rentiq_units.reduce((sum: number, unit: any) => sum + unit.suggested_new_rent, 0) / result.data.rentiq_units.length
            : 0,
          total_potential_increase: 0,
          occupancy_rate: result.data.current_occupancy,
          target_occupancy: result.data.target_occupancy,
          units_needed_for_target: result.data.units_needed_for_95
        },
        thresholds: {},
        units: result.data.rentiq_units?.map((unit: any) => ({
          unit: unit.unit,
          market_rent: unit.market_rent,
          suggested_rent: unit.suggested_new_rent,
          days_vacant: unit.days_vacant,
          category: unit.assigned_category,
          min_threshold: unit.minimum_threshold,
          cap_applied: unit.cap_applied,
          pricing_tier: unit.pricing_tier
        })) || []
      }
      
      setRentiqData(transformedData)
      
      // Load current thresholds
      await fetchThresholds()
      setError(null)
    } catch (err) {
      console.error('[RentIQ] Fetch error:', err)
      
      // Retry logic for network errors (but not for data structure errors)
      if (retryCount < 2 && (
        err instanceof Error && (
          err.name === 'AbortError' || 
          err.message.includes('fetch') || 
          err.message.includes('network') ||
          err.message.includes('HTTP 5')
        )
      )) {
        console.log(`[RentIQ] Retrying fetch (attempt ${retryCount + 1}/2)...`)
        setTimeout(() => {
          fetchRentIQData(recalculate, retryCount + 1)
        }, 1000 * (retryCount + 1)) // Progressive delay
        return
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(`Failed to fetch RentIQ data: ${errorMessage}`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchThresholds = async () => {
    try {
      const response = await fetch('/api/rentiq/thresholds', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        cache: 'no-store'
      })
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          console.log('[RentIQ] Loaded thresholds from API:', data.thresholds)
          setThresholds(data.thresholds)
        }
      }
    } catch (error) {
      console.warn('Failed to fetch thresholds:', error)
    }
  }

  const saveThresholds = async () => {
    try {
      setSavingThresholds(true)
      const response = await fetch('/api/rentiq/thresholds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify({ thresholds })
      })

      const result = await response.json()
      if (result.success) {
        alert('✅ Thresholds saved successfully!')
        
        // Force fresh load of thresholds from database
        await fetchThresholds()
        
        // Refresh calculations to see updated suggestions
        await refreshCalculations()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Save error:', error)
      alert(`❌ Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSavingThresholds(false)
    }
  }

  const refreshCalculations = async () => {
    try {
      setRefreshing(true)
      // Recalculate using existing data and current thresholds
      const response = await fetch('/api/rentiq?recalculate=true', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      if (!response.ok) {
        throw new Error(`Failed to refresh calculations: ${response.statusText}`)
      }
      const result = await response.json()
      
      if (result.status === 'error') {
        throw new Error(result.error)
      }
      
      // Transform the API response to match our expected structure
      const transformedData = {
        date: result.data.date,
        summary: {
          total_units: result.data.total_units,
          vacant_units: result.data.total_units - result.data.occupied_units,
          units_with_suggestions: result.data.rentiq_units?.length || 0,
          average_suggested_rent: result.data.rentiq_units?.length > 0 
            ? result.data.rentiq_units.reduce((sum: number, unit: any) => sum + unit.suggested_new_rent, 0) / result.data.rentiq_units.length
            : 0,
          total_potential_increase: 0,
          occupancy_rate: result.data.current_occupancy,
          target_occupancy: result.data.target_occupancy,
          units_needed_for_target: result.data.units_needed_for_95
        },
        thresholds: {},
        units: result.data.rentiq_units?.map((unit: any) => ({
          unit: unit.unit,
          market_rent: unit.market_rent,
          suggested_rent: unit.suggested_new_rent,
          days_vacant: unit.days_vacant,
          category: unit.assigned_category,
          min_threshold: unit.minimum_threshold,
          cap_applied: unit.cap_applied,
          pricing_tier: unit.pricing_tier
        })) || []
      }
      
      setRentiqData(transformedData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchRentIQData()
  }, [])

  const exportToCSV = async () => {
    if (!rentiqData?.date) return

    try {
      setExporting(true)

      // Call export API that sends email and returns CSV
      const response = await fetch('/api/rentiq/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: rentiqData.date
        })
      })

      const result = await response.json()

      if (result.status === 'error') {
        throw new Error(result.error)
      }

      // Download CSV locally
      const blob = new Blob([result.data.csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `rentiq-suggestions-${result.data.date}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Show success message
      alert(`✅ Export successful!\n\nCSV downloaded and emailed to leasing@cynthiagardens.com\nUnits: ${result.data.unitsCount}\nDate: ${result.data.date}`)

    } catch (error) {
      console.error('Export error:', error)
      alert(`❌ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading RentIQ data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="text-red-500 text-center">
          <p className="text-lg font-semibold">Error Loading RentIQ</p>
          <p className="text-sm">{error}</p>
        </div>
        <Button onClick={() => fetchRentIQData()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 text-white rounded-lg shadow-xl p-6">
        <div className="space-y-4">
          {/* Mobile-first title section - no text cut-off */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
              🏢 <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">RentIQ</span> Advanced
            </h1>
            <p className="text-gray-300 text-sm sm:text-base max-w-2xl">
              Progressive pricing engine with category mapping and threshold management to reach{' '}
              <span className="font-semibold text-green-400 text-lg">95% occupancy</span>
            </p>
          </div>
          
          {/* Button positioned below title to prevent text cut-off */}
          <Button 
            onClick={refreshCalculations} 
            variant="secondary"
            disabled={refreshing}
            className="w-fit bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 transition-all duration-300"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Threshold Settings Card */}
      <Card className="bg-slate-800 border-slate-700 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white rounded-t-lg">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            ⚙️ Minimum Rent Thresholds
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 bg-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {Object.entries({
              'min_basic_furnished': 'Basic Furnished',
              'min_basic_unfurnished': 'Basic Unfurnished', 
              'min_premium_furnished': 'Premium Furnished',
              'min_premium_unfurnished': 'Premium Unfurnished',
              'min_upgraded_furnished': 'Upgraded Furnished',
              'min_upgraded_unfurnished': 'Upgraded Unfurnished',
              'min_student_unit': 'Student Unit'
            }).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key} className="text-sm font-medium text-gray-300">
                  {label}
                </Label>
                <Input
                  id={key}
                  type="number"
                  step="1"
                  min="0"
                  max="10000"
                  value={thresholds[key] || ''}
                  onChange={(e) => setThresholds(prev => ({
                    ...prev,
                    [key]: parseInt(e.target.value) || 0
                  }))}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="Enter minimum rent"
                />
              </div>
            ))}
          </div>
          <Button 
            onClick={saveThresholds}
            disabled={savingThresholds}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {savingThresholds ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            💾 Save Thresholds
          </Button>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Occupancy Card */}
        <Card className="bg-slate-800 border-slate-700 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-blue-700 to-cyan-700 text-white rounded-t-lg pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              🏠 Current Occupancy
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 bg-slate-800">
            <div className="text-2xl font-bold text-blue-400">
              {rentiqData?.summary.occupancy_rate ? rentiqData.summary.occupancy_rate.toFixed(1) : '0.0'}%
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {rentiqData?.summary ? (rentiqData.summary.total_units - rentiqData.summary.vacant_units) : 0}/{rentiqData?.summary?.total_units || 0} units occupied
            </p>
          </CardContent>
        </Card>

        {/* Target Progress Card */}
        <Card className="bg-slate-800 border-slate-700 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-purple-700 to-pink-700 text-white rounded-t-lg pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              🎯 Target Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 bg-slate-800">
            <div className="text-2xl font-bold text-purple-400">
              {rentiqData?.summary?.units_needed_for_target || 0} units
            </div>
            <p className="text-xs text-gray-400 mt-1">
              needed for {rentiqData?.summary?.target_occupancy || 95}% occupancy
            </p>
          </CardContent>
        </Card>

        {/* Units with Suggestions Card */}
        <Card className="bg-slate-800 border-slate-700 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-emerald-700 to-green-700 text-white rounded-t-lg pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              💡 Pricing Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 bg-slate-800">
            <div className="text-2xl font-bold text-emerald-400">
              {rentiqData?.summary?.units_with_suggestions || 0}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              units have pricing suggestions
            </p>
          </CardContent>
        </Card>

        {/* Average Suggested Rent Card */}
        <Card className="bg-slate-800 border-slate-700 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-orange-700 to-yellow-600 text-white rounded-t-lg pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              💰 Avg Suggested Rent
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 bg-slate-800">
            <div className="text-2xl font-bold text-orange-400">
              ${rentiqData?.summary?.average_suggested_rent ? rentiqData.summary.average_suggested_rent.toLocaleString() : '0'}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              average across all suggestions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* RentIQ Units Table */}
      <Card className="bg-slate-800 border-slate-700 shadow-2xl">
        <CardHeader className="bg-gradient-to-r from-violet-800 to-purple-800 text-white rounded-t-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              🎯 RentIQ Suggested Pricing
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-violet-200">
                📅 Data as of {rentiqData?.date}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700 border-b-2 border-slate-600">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-300">🏠 Unit</th>
                  <th className="text-left p-3 font-semibold text-gray-300">💰 Suggested Rent</th>
                  <th className="text-left p-3 font-semibold text-gray-300">📅 Days Vacant</th>
                  <th className="text-left p-3 font-semibold text-gray-300">🏷️ Category</th>
                  <th className="text-left p-3 font-semibold text-gray-300">🎯 Min Threshold</th>
                  <th className="text-left p-3 font-semibold text-gray-300">🛡️ Cap Applied</th>
                  <th className="text-left p-3 font-semibold text-gray-300">⭐ Pricing Tier</th>
                </tr>
              </thead>
              <tbody>
                {rentiqData?.units.map((unit, index) => (
                  <tr 
                    key={unit.unit} 
                    className={`border-b border-slate-700 hover:bg-slate-700/50 transition-colors ${
                      index % 2 === 0 ? 'bg-slate-800' : 'bg-slate-750'
                    }`}
                  >
                    <td className="p-3 font-medium text-gray-200">{unit.unit}</td>
                    <td className="p-3">
                      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-1 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 text-xl font-bold inline-block">
                        💵 ${unit.suggested_rent.toLocaleString()}
                      </div>
                    </td>
                    <td className="p-3 text-gray-300">{unit.days_vacant}</td>
                    <td className="p-3 text-gray-300">{unit.category}</td>
                    <td className="p-3 text-gray-300">${unit.min_threshold.toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        unit.cap_applied 
                          ? 'bg-orange-900/50 text-orange-300 border border-orange-700' 
                          : 'bg-green-900/50 text-green-300 border border-green-700'
                      }`}>
                        {unit.cap_applied ? '⚠️ Yes' : '✅ No'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        unit.pricing_tier === 'Tier 1' 
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                          : unit.pricing_tier === 'Tier 2'
                          ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                          : 'bg-gray-900/50 text-gray-300 border border-gray-700'
                      }`}>
                        {unit.pricing_tier === 'Tier 1' ? '⭐⭐⭐' : unit.pricing_tier === 'Tier 2' ? '⭐⭐' : '⭐'} {unit.pricing_tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Download Button */}
      <div className="flex justify-center">
        <Button
          onClick={exportToCSV}
          variant="default"
          size="lg"
          disabled={exporting}
          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-4 px-8 text-lg shadow-xl transform hover:scale-105 transition-all duration-300"
        >
          {exporting ? (
            <Loader2 className="h-6 w-6 mr-3 animate-spin" />
          ) : (
            <Download className="h-6 w-6 mr-3" />
          )}
          📊 {exporting ? 'Exporting & Emailing...' : 'Download & Email RentIQ Report'}
        </Button>
      </div>

      {/* System Information */}
      <Card className="bg-slate-800 border-slate-700 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-blue-800 to-indigo-800 text-white rounded-t-lg">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            📊 RentIQ System Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 bg-slate-800">
          <div className="text-gray-300 text-sm space-y-3">
            <p className="flex items-center gap-2">
              <span className="font-bold text-blue-400">📅 Data Source:</span> Master CSV data as of {rentiqData?.date}
            </p>
            <p className="flex items-start gap-2">
              <span className="font-bold text-blue-400">📈 Progressive Discounting:</span> 
              <span>Days 1-6: Tier 1 (15%), Tier 2 (10%), Tier 3 (0%) | Days 7-13: Tier 1 (20%), Tier 2 (15%), Tier 3 (5%) | Days 14-20: Tier 1 (25%), Tier 2 (20%), Tier 3 (10%) | Days 21+: Tier 1 (30%), Tier 2 (25%), Tier 3 (15%)</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-bold text-blue-400">🎯 Tier Assignment:</span>
              <span>Tier 1 (Market Rent ≥ $2,300) | Tier 2 (Market Rent $1,800-$2,299) | Tier 3 (Market Rent &lt; $1,800)</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-bold text-blue-400">🏷️ Category Mapping:</span>
              <span>Exact market rent match determines pricing category and minimum threshold</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}