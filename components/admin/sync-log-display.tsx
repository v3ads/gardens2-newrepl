'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, Clock, Database, Activity } from 'lucide-react'
import { EasternTimeManager } from '@/lib/timezone-utils'

interface SyncStatus {
  isSyncing: boolean
  progress: string | null
  syncType: string | null
  currentStep: number | null
  totalSteps: number | null
  lastSyncTime: string | null
  lastSyncSuccess: boolean
  totalRecords: number
  errorMessage: string | null
  detailedSync: {
    isActive: boolean
    currentStepName: string | null
    stepsProgress: {
      completed: number
      failed: number
      total: number
      running: number
    }
    lastRun: {
      status: string
      date: string | null
      duration: string
      recordsProcessed: number
      stepsCompleted: number
      stepsFailed: number
    }
    allSteps: Array<{
      name: string
      category: string
      status: string
      duration: string | null
      recordsProcessed: number | null
      error: any
    }>
  }
  jobQueueStatus: {
    queuedJobs: number
    runningJobs: number
    failedJobs: number
    completedJobs: number
    recentJobs: Array<{
      id: string
      type: string
      status: string
      createdAt: string
      lastError: string | null
      lastRun: {
        startedAt: string
        finishedAt: string | null
        success: boolean
        durationMs: number
      } | null
    }>
  }
}

export function SyncLogDisplay() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [logs])

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/sync/status')
        const data = await response.json()
        setStatus(data)
        setLoading(false)

        if (data.isSyncing) {
          const timestamp = new Date().toLocaleTimeString()
          const progress = data.progress || 'Processing...'
          const step = data.currentStep && data.totalSteps 
            ? ` [Step ${data.currentStep}/${data.totalSteps}]`
            : ''
          
          setLogs(prev => {
            const newLogs = [...prev, `[${timestamp}] ${progress}${step}`]
            if (newLogs.length > 100) {
              return newLogs.slice(-100)
            }
            return newLogs
          })
        }
      } catch (error) {
        console.error('Failed to fetch sync status:', error)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card className="mt-6">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return null
  }

  // CRITICAL FIX: Only show "Sync in Progress" if there are actually running jobs
  // Don't rely on stale detailedSync.isActive status
  const hasRunningJobs = status.jobQueueStatus?.runningJobs > 0
  const isActuallyRunning = status.isSyncing || hasRunningJobs
  
  if (isActuallyRunning) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse text-blue-500" />
            Sync in Progress
            {status.syncType && (
              <Badge variant="outline" className="ml-2">
                {status.syncType}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status.currentStep && status.totalSteps && (
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span className="font-mono">
                  {status.currentStep} / {status.totalSteps} steps
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(status.currentStep / status.totalSteps) * 100}%`
                  }}
                />
              </div>
            </div>
          )}
          
          <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-[500px] overflow-y-auto">
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))
            ) : (
              <div className="text-gray-500">Waiting for sync logs...</div>
            )}
            <div ref={logsEndRef} />
          </div>

          {status.detailedSync.allSteps.length > 0 && (
            <div className="mt-4 grid gap-2">
              <div className="text-sm font-medium mb-2">Step Status:</div>
              {status.detailedSync.allSteps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    {step.status === 'completed' && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {step.status === 'running' && (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    )}
                    {step.status === 'failed' && (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    {step.status === 'pending' && (
                      <Clock className="h-4 w-4 text-gray-400" />
                    )}
                    <span>{step.name}</span>
                  </div>
                  {step.duration && (
                    <span className="text-muted-foreground">{step.duration}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          System Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              {status.lastSyncSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              Last Sync Status
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={status.lastSyncSuccess ? 'default' : 'destructive'}>
                  {status.lastSyncSuccess ? 'Success' : 'Failed'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time (EST):</span>
                <span className="font-mono">
                  {status.detailedSync?.lastRun?.date
                    ? EasternTimeManager.formatTimestampForDisplay(status.detailedSync.lastRun.date)
                    : status.lastSyncTime || 'Never'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Records:</span>
                <span className="font-mono">{status.totalRecords.toLocaleString()}</span>
              </div>
              {status.detailedSync.lastRun && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-mono">{status.detailedSync.lastRun.duration}</span>
                </div>
              )}
            </div>
            {status.errorMessage && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-xs text-red-800 dark:text-red-200">
                {status.errorMessage}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Job Queue Status
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Queued:</span>
                <span className="font-mono">{status.jobQueueStatus.queuedJobs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Running:</span>
                <span className="font-mono">{status.jobQueueStatus.runningJobs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed:</span>
                <span className="font-mono text-green-600 dark:text-green-400">
                  {status.jobQueueStatus.completedJobs}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Failed:</span>
                <span className="font-mono text-red-600 dark:text-red-400">
                  {status.jobQueueStatus.failedJobs}
                </span>
              </div>
            </div>
          </div>
        </div>

        {status.jobQueueStatus.recentJobs.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Recent Jobs</h3>
            <div className="space-y-2">
              {status.jobQueueStatus.recentJobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-muted rounded text-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{job.type}</Badge>
                      <Badge
                        variant={
                          job.status === 'SUCCEEDED'
                            ? 'default'
                            : job.status === 'FAILED'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {EasternTimeManager.formatTimestampForDisplay(job.createdAt)}
                    </div>
                    {job.lastError && (
                      <div className="text-xs text-red-600 dark:text-red-400 max-w-md truncate">
                        {job.lastError}
                      </div>
                    )}
                  </div>
                  {job.lastRun && job.lastRun.durationMs && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {Math.round(job.lastRun.durationMs / 1000)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {status.detailedSync.lastRun && status.detailedSync.allSteps.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Last Sync Steps</h3>
            <div className="grid gap-2">
              {status.detailedSync.allSteps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    {step.status === 'completed' && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {step.status === 'failed' && (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span>{step.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {step.recordsProcessed !== null && (
                      <span>{step.recordsProcessed} records</span>
                    )}
                    {step.duration && <span>{step.duration}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
