'use client'

import { useEffect, useState } from 'react'
// Using custom progress bar since Progress component not available
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

interface SyncStatus {
  isSyncing: boolean
  progress: string | null
  syncType: string | null
  currentStep: number | null
  totalSteps: number | null
  lastSyncTime: string | null
  lastSyncSuccess: boolean | null
  totalRecords: number
}

// Map progress messages to percentage values (0-100)
const progressMap: Record<string, number> = {
  'Starting sync...': 5,
  'Syncing master.csv from Google Sheets...': 10,
  'Sending daily email notification...': 15,
  'Ingesting AppFolio reports...': 25,
  'Ingesting vacancy data from Google Sheets...': 40,
  'Building analytics master table...': 50,
  'Processing operational analytics...': 60,
  'Building tenant mart...': 70,
  'Running stability checks...': 80,
  'Calculating RentIQ pricing...': 85,
  'Performing database maintenance...': 90,
  'Email notification completed early...': 92,
  'Calculating occupancy KPIs...': 95,
  'Sync completed successfully!': 100,
}

// Extract step information from progress message
const getStepInfo = (progress: string | null): { step: number; total: number; message: string } => {
  if (!progress) return { step: 0, total: 9, message: 'Waiting...' }
  
  // Count total steps (9 main steps based on the sync manager)
  const totalSteps = 9
  
  // Determine current step based on progress message
  let currentStep = 0
  let cleanMessage = progress
  
  if (progress.includes('Starting sync')) {
    currentStep = 1
    cleanMessage = 'Starting sync process'
  } else if (progress.includes('master.csv')) {
    currentStep = 1
    cleanMessage = 'Syncing master CSV data'
  } else if (progress.includes('email notification')) {
    currentStep = 2
    cleanMessage = 'Sending notifications'
  } else if (progress.includes('AppFolio reports')) {
    currentStep = 3
    cleanMessage = 'Ingesting AppFolio data'
  } else if (progress.includes('vacancy data')) {
    currentStep = 4
    cleanMessage = 'Processing vacancy data'
  } else if (progress.includes('analytics master')) {
    currentStep = 5
    cleanMessage = 'Building analytics tables'
  } else if (progress.includes('operational analytics')) {
    currentStep = 6
    cleanMessage = 'Processing operational data'
  } else if (progress.includes('tenant mart')) {
    currentStep = 7
    cleanMessage = 'Building tenant analytics'
  } else if (progress.includes('stability') || progress.includes('RentIQ') || progress.includes('database maintenance')) {
    currentStep = 8
    cleanMessage = 'Running system maintenance'
  } else if (progress.includes('KPIs') || progress.includes('completed')) {
    currentStep = 9
    cleanMessage = 'Finalizing calculations'
  } else if (progress.includes('Error:')) {
    cleanMessage = progress.replace('Error: ', '')
  }
  
  return { step: currentStep, total: totalSteps, message: cleanMessage }
}

interface SyncProgressBarProps {
  isVisible: boolean
  onSyncComplete?: () => void
}

export function SyncProgressBar({ isVisible, onSyncComplete }: SyncProgressBarProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (!isVisible) {
      setSyncStatus(null)
      setError(null)
      return
    }
    
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/sync/status', {
          cache: 'no-store'
        })
        if (response.ok) {
          const data = await response.json()
          setSyncStatus(data)
          setError(null)
          
          // Call completion callback if sync just finished
          if (!data.isSyncing && data.lastSyncSuccess && onSyncComplete) {
            setTimeout(onSyncComplete, 2000) // Wait 2s to show completion state
          }
        }
      } catch (err) {
        console.error('[SYNC_PROGRESS] Failed to fetch sync status:', err)
        setError('Failed to fetch sync status')
      }
    }
    
    // Initial fetch
    fetchStatus()
    
    // Poll every 2 seconds while visible
    const interval = setInterval(fetchStatus, 2000)
    
    return () => clearInterval(interval)
  }, [isVisible, onSyncComplete])
  
  if (!isVisible || !syncStatus) {
    return null
  }
  
  // Use API step values if available, otherwise fall back to calculated steps
  const currentStep = syncStatus.currentStep || getStepInfo(syncStatus.progress).step
  const totalSteps = syncStatus.totalSteps || getStepInfo(syncStatus.progress).total
  const stepMessage = getStepInfo(syncStatus.progress).message
  const progressPercentage = syncStatus.progress ? (progressMap[syncStatus.progress] || Math.round((currentStep / totalSteps) * 100)) : 0
  const hasError = syncStatus.progress?.includes('Error:')
  
  return (
    <div className="mt-3 p-4 border rounded-lg bg-card">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {hasError ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : syncStatus.isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            ) : syncStatus.lastSyncSuccess ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-500" />
            )}
            <span className="font-medium">
              {syncStatus.isSyncing ? 'Sync in Progress' : 'Sync Status'}
            </span>
          </div>
          <span className="text-muted-foreground">
            {syncStatus.isSyncing ? `Step ${currentStep} of ${totalSteps}` : `${progressPercentage}%`}
          </span>
        </div>
        
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              hasError 
                ? 'bg-red-500' 
                : syncStatus.lastSyncSuccess && !syncStatus.isSyncing 
                  ? 'bg-green-500' 
                  : 'bg-blue-500'
            }`}
            style={{ 
              width: `${progressPercentage}%`,
              minWidth: progressPercentage > 0 ? '2%' : '0%'
            }}
          />
        </div>
        
        <div className="text-sm text-muted-foreground">
          {hasError ? (
            <span className="text-red-600">{stepMessage}</span>
          ) : syncStatus.isSyncing ? (
            stepMessage
          ) : syncStatus.lastSyncSuccess ? (
            `Last sync completed successfully${syncStatus.totalRecords > 0 ? ` (${syncStatus.totalRecords.toLocaleString()} records processed)` : ''}`
          ) : (
            'Sync failed - check logs for details'
          )}
        </div>
        
        {syncStatus.lastSyncTime && (
          <div className="text-xs text-muted-foreground">
            Last sync: {syncStatus.lastSyncTime}
          </div>
        )}
        
        {error && (
          <div className="text-xs text-red-500">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}