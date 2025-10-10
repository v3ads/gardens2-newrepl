
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Activity,
  PlayCircle,
  StopCircle,
  RefreshCw
} from 'lucide-react'
import { EasternTimeManager } from '@/lib/timezone-utils'

interface SyncMonitorData {
  currentStatus: {
    isSyncing: boolean
    syncType: string | null
    currentStep: number | null
    totalSteps: number | null
    progress: string | null
    startTime: string | null
  }
  jobQueue: {
    queuedJobs: number
    runningJobs: number
    failedJobs: number
    completedJobs: number
    recentJobs: Array<{
      id: string
      type: string
      status: string
      createdAt: string
      attempts: number
      lastError: string | null
    }>
  }
  stuckDetection: {
    hasStuckSync: boolean
    stuckSyncs: Array<{
      lockId: string
      owner: string
      hoursStuck: number
      currentProgress: string
    }>
  }
  lastSync: {
    date: string | null
    success: boolean
    duration: number
    recordsProcessed: number
  }
  detailedSteps: Array<{
    name: string
    status: string
    duration: string | null
    recordsProcessed: number | null
  }>
}

export function EnhancedSyncMonitor() {
  const [data, setData] = useState<SyncMonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const fetchMonitoringData = async () => {
    console.log('[SYNC_MONITOR] Starting fetch...')
    try {
      console.log('[SYNC_MONITOR] Fetching status APIs...')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        console.log('[SYNC_MONITOR] Fetch timeout!')
        controller.abort()
      }, 10000)
      
      const [syncStatus, stuckStatus] = await Promise.all([
        fetch('/api/sync/status', { 
          cache: 'no-store',
          signal: controller.signal 
        }).then(r => {
          console.log('[SYNC_MONITOR] Sync status response:', r.status)
          return r.json()
        }),
        fetch('/api/sync/stuck-detection', { 
          cache: 'no-store',
          signal: controller.signal 
        }).then(r => {
          console.log('[SYNC_MONITOR] Stuck detection response:', r.status)
          return r.json()
        })
      ])
      
      clearTimeout(timeoutId)
      console.log('[SYNC_MONITOR] Data fetched successfully')

      setData({
        currentStatus: {
          isSyncing: syncStatus.isSyncing || syncStatus.jobQueueStatus?.runningJobs > 0,
          syncType: syncStatus.syncType,
          currentStep: syncStatus.currentStep,
          totalSteps: syncStatus.totalSteps,
          progress: syncStatus.progress,
          startTime: syncStatus.detailedSync?.currentRun?.startedAt || null
        },
        jobQueue: {
          queuedJobs: syncStatus.jobQueueStatus?.queuedJobs || 0,
          runningJobs: syncStatus.jobQueueStatus?.runningJobs || 0,
          failedJobs: syncStatus.jobQueueStatus?.failedJobs || 0,
          completedJobs: syncStatus.jobQueueStatus?.completedJobs || 0,
          recentJobs: syncStatus.jobQueueStatus?.recentJobs || []
        },
        stuckDetection: {
          hasStuckSync: stuckStatus.hasStuckSync || false,
          stuckSyncs: stuckStatus.stuckSyncs || []
        },
        lastSync: {
          date: syncStatus.lastSyncTime,
          success: syncStatus.lastSyncSuccess,
          duration: syncStatus.detailedSync?.lastRun?.duration || 0,
          recordsProcessed: syncStatus.totalRecords || 0
        },
        detailedSteps: syncStatus.detailedSync?.allSteps || []
      })

      setLastUpdate(new Date())
      setLoading(false)
      console.log('[SYNC_MONITOR] State updated, loading=false')
    } catch (error) {
      console.error('[SYNC_MONITOR] Error fetching data:', error)
      setLoading(false)
      console.log('[SYNC_MONITOR] Error handled, loading=false')
    }
  }

  useEffect(() => {
    fetchMonitoringData()
    
    if (autoRefresh) {
      const interval = setInterval(fetchMonitoringData, 5000) // 5 second refresh
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const handleManualRefresh = () => {
    setLoading(true)
    fetchMonitoringData()
  }

  const handleRecoverStuck = async () => {
    try {
      await fetch('/api/sync/stuck-detection', { method: 'POST' })
      alert('Stuck sync recovery triggered')
      fetchMonitoringData()
    } catch (error) {
      alert('Failed to trigger recovery')
    }
  }

  if (loading || !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const isHealthy = !data.stuckDetection.hasStuckSync && 
                    data.jobQueue.failedJobs < data.jobQueue.completedJobs &&
                    data.lastSync.success

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Sync Monitoring</h2>
          <Badge variant={isHealthy ? 'default' : 'destructive'}>
            {isHealthy ? 'HEALTHY' : 'ATTENTION NEEDED'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Pause' : 'Resume'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <span className="text-xs text-muted-foreground">
            Updated {Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s ago
          </span>
        </div>
      </div>

      {/* Critical Alerts */}
      {data.stuckDetection.hasStuckSync && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
              STUCK SYNC DETECTED
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.stuckDetection.stuckSyncs.map((stuck, idx) => (
              <div key={idx} className="space-y-2 mb-4">
                <div className="text-sm">
                  <strong>Lock:</strong> {stuck.lockId}
                </div>
                <div className="text-sm">
                  <strong>Stuck for:</strong> {stuck.hoursStuck.toFixed(1)} hours
                </div>
                <div className="text-sm">
                  <strong>Progress:</strong> {stuck.currentProgress}
                </div>
              </div>
            ))}
            <Button onClick={handleRecoverStuck} variant="destructive" size="sm">
              Force Recovery
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data.currentStatus.isSyncing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                Sync In Progress
              </>
            ) : (
              <>
                <Activity className="h-5 w-5" />
                System Status
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current State:</span>
                <Badge variant={data.currentStatus.isSyncing ? 'default' : 'secondary'}>
                  {data.currentStatus.isSyncing ? 'RUNNING' : 'IDLE'}
                </Badge>
              </div>
              {data.currentStatus.isSyncing && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress:</span>
                    <span className="font-mono">
                      {data.currentStatus.currentStep}/{data.currentStatus.totalSteps} steps
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${((data.currentStatus.currentStep || 0) / (data.currentStatus.totalSteps || 1)) * 100}%`
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {data.currentStatus.progress || 'Processing...'}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Sync:</span>
                <span className={data.lastSync.success ? 'text-green-600' : 'text-red-600'}>
                  {data.lastSync.success ? 'SUCCESS' : 'FAILED'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Time:</span>
                <span className="font-mono text-xs">
                  {data.lastSync.date ? EasternTimeManager.formatTimestampForDisplay(data.lastSync.date) : 'Never'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Records:</span>
                <span className="font-mono">{data.lastSync.recordsProcessed.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Job Queue Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Job Queue Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{data.jobQueue.queuedJobs}</div>
              <div className="text-xs text-muted-foreground">Queued</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{data.jobQueue.runningJobs}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{data.jobQueue.completedJobs}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{data.jobQueue.failedJobs}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>

          {data.jobQueue.recentJobs.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Recent Jobs</h4>
              {data.jobQueue.recentJobs.slice(0, 3).map(job => (
                <div key={job.id} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{job.type}</Badge>
                    <Badge
                      variant={
                        job.status === 'SUCCEEDED' ? 'default' :
                        job.status === 'FAILED' ? 'destructive' :
                        'secondary'
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {EasternTimeManager.formatTimestampForDisplay(job.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step Details */}
      {data.detailedSteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sync Step Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.detailedSteps.map((step, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    {step.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {step.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {step.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                    {step.status === 'pending' && <Clock className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm">{step.name}</span>
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}
