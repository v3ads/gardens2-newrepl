'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface SyncStatus {
  isSyncing: boolean
  syncProgress?: string
  lastSyncTime?: string
  syncType?: 'daily' | 'webhook' | 'manual'
}

interface SyncStatusContextType {
  status: SyncStatus
  startSync: (type: 'daily' | 'webhook' | 'manual', progress?: string) => void
  updateProgress: (progress: string) => void
  completeSync: () => void
  errorSync: (error: string) => void
}

const SyncStatusContext = createContext<SyncStatusContextType | null>(null)

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false
  })

  // Check sync status on mount and periodically
  useEffect(() => {
    const checkSyncStatus = async () => {
      try {
        const response = await fetch('/api/sync/status', {
          cache: 'no-store'
        })
        if (response.ok) {
          const data = await response.json()
          setStatus(prev => ({
            ...prev,
            isSyncing: data.isSyncing || false,
            syncProgress: data.progress,
            syncType: data.syncType,
            lastSyncTime: data.lastSyncTime
          }))
        }
      } catch (error) {
        console.error('Error checking sync status:', error)
      }
    }

    checkSyncStatus()
    const interval = setInterval(checkSyncStatus, 60000) // Check every 60 seconds instead of 2
    
    return () => clearInterval(interval)
  }, [])

  const startSync = (type: 'daily' | 'webhook' | 'manual', progress?: string) => {
    setStatus({
      isSyncing: true,
      syncProgress: progress || 'Starting sync...',
      syncType: type,
      lastSyncTime: new Date().toISOString()
    })
  }

  const updateProgress = (progress: string) => {
    setStatus(prev => ({
      ...prev,
      syncProgress: progress
    }))
  }

  const completeSync = () => {
    setStatus(prev => ({
      ...prev,
      isSyncing: false,
      syncProgress: undefined,
      lastSyncTime: new Date().toISOString()
    }))
  }

  const errorSync = (error: string) => {
    setStatus(prev => ({
      ...prev,
      isSyncing: false,
      syncProgress: `Error: ${error}`
    }))
  }

  return (
    <SyncStatusContext.Provider value={{
      status,
      startSync,
      updateProgress,
      completeSync,
      errorSync
    }}>
      {children}
    </SyncStatusContext.Provider>
  )
}

export function useSyncStatus() {
  const context = useContext(SyncStatusContext)
  if (!context) {
    throw new Error('useSyncStatus must be used within a SyncStatusProvider')
  }
  return context
}