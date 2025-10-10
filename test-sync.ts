import { jobQueueService } from './lib/job-queue-service'

async function triggerSync() {
  const jobId = await jobQueueService.enqueueJob(
    'MANUAL_SYNC',
    { triggeredBy: 'dev-verification', syncType: 'manual', timestamp: new Date().toISOString() },
    { priority: 1 }
  )
  console.log('✅ Sync job enqueued:', jobId)
  console.log('📊 Monitor progress:')
  console.log('  curl -s http://localhost:5000/api/sync/status | jq -r .currentProgress')
}

triggerSync().catch(console.error)
