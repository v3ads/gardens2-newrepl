'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Database, RefreshCw } from 'lucide-react'

interface AnalyticsErrorStateProps {
  error: string
  message: string
  onRetry?: () => void
}

export function AnalyticsErrorState({ error, message, onRetry }: AnalyticsErrorStateProps) {
  const [isInitializing, setIsInitializing] = useState(false)
  
  const handleInitialize = async () => {
    setIsInitializing(true)
    try {
      console.log('[ANALYTICS_ERROR] Attempting to initialize analytics...')
      
      const response = await fetch('/api/analytics/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        console.log('[ANALYTICS_ERROR] Analytics initialized successfully')
        // Wait a moment then retry
        setTimeout(() => {
          setIsInitializing(false)
          onRetry?.()
        }, 2000)
      } else {
        const errorData = await response.json()
        console.error('[ANALYTICS_ERROR] Initialization failed:', errorData)
        setIsInitializing(false)
        alert(`Initialization failed: ${errorData.message || 'Unknown error'}`)
      }
    } catch (err) {
      console.error('[ANALYTICS_ERROR] Network error during initialization:', err)
      setIsInitializing(false)
      alert('Network error during initialization. Please check your connection.')
    }
  }
  
  const isDataError = error === 'no_data' || error === 'database_unavailable' || error === 'database_error'
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center">
      <div className="mb-4">
        {isDataError ? (
          <Database className="h-12 w-12 text-orange-500 mx-auto" />
        ) : (
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
        )}
      </div>
      
      <h3 className="text-lg font-semibold mb-2 text-red-400">
        Failed to load occupancy data
      </h3>
      
      <p className="text-sm text-gray-400 mb-6 max-w-md">
        {message}
      </p>
      
      <div className="flex gap-3">
        {isDataError && (
          <Button
            onClick={handleInitialize}
            disabled={isInitializing}
            variant="default"
            className="bg-green-600 hover:bg-green-700"
          >
            {isInitializing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Initialize Data
              </>
            )}
          </Button>
        )}
        
        <Button
          onClick={onRetry}
          variant="outline"
          disabled={isInitializing}
          className="border-gray-600 text-gray-300 hover:bg-gray-800"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
      
      {isDataError && (
        <p className="text-xs text-gray-500 mt-4 max-w-sm">
          This appears to be a new deployment. Click "Initialize Data" to set up the analytics system with master data.
        </p>
      )}
    </div>
  )
}