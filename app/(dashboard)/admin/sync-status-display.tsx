import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DailySyncManager } from '@/lib/daily-sync-manager'
import { JobQueueService } from '@/lib/job-queue-service'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export async function SyncStatusDisplay() {
  const syncManager = DailySyncManager.getInstance()
  const jobQueueService = JobQueueService.getInstance()
  
  const [status, queueStatus, recentJobs] = await Promise.all([
    syncManager.getSyncStatus(),
    jobQueueService.getQueueStatus(),
    jobQueueService.getRecentJobs(5)
  ])
  
  const isSyncing = queueStatus.runningJobs > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Sync Status Monitor</span>
          {isSyncing ? (
            <Badge variant="default" className="bg-blue-500">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Syncing
            </Badge>
          ) : status.last_sync_success ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Healthy
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="mr-1 h-3 w-3" />
              Error
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Real-time synchronization status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Last Sync</p>
            <p className="text-2xl font-bold">{status.last_sync_date || 'Never'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Records</p>
            <p className="text-2xl font-bold">{status.total_records.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Job Queue</p>
            <p className="text-2xl font-bold">
              {queueStatus.runningJobs} running / {queueStatus.queuedJobs} queued
            </p>
          </div>
        </div>

        {queueStatus.failedJobs > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">
              {queueStatus.failedJobs} failed job{queueStatus.failedJobs > 1 ? 's' : ''}
            </p>
          </div>
        )}

        {recentJobs.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Recent Jobs</p>
            <div className="space-y-2">
              {recentJobs.slice(0, 3).map((job: any) => (
                <div key={job.id} className="flex items-center justify-between rounded-lg border p-2">
                  <span className="text-sm">{job.type}</span>
                  <Badge variant={job.status === 'SUCCEEDED' ? 'default' : job.status === 'FAILED' ? 'destructive' : 'secondary'}>
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
