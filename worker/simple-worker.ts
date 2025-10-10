#!/usr/bin/env tsx

/**
 * BULLETPROOF Simplified Worker - No more stuck jobs!
 */

import { jobQueueService } from '../lib/job-queue-service'

// Environment detection (worker should be run with NODE_ENV=production)
const environment = process.env.NODE_ENV || 'development'

console.log('[SIMPLE_WORKER] 🚀 Starting bulletproof worker...')
console.log(`[SIMPLE_WORKER] 📊 Environment: ${environment}`)

async function processJobs() {
  while (true) {
    try {
      console.log('[SIMPLE_WORKER] 🔍 Checking for jobs...')
      
      const jobs = await jobQueueService.getNextJob('simple-worker', 1)
      
      if (jobs.length === 0) {
        console.log('[SIMPLE_WORKER] 😴 No jobs found, waiting 5s...')
        await new Promise(resolve => setTimeout(resolve, 5000))
        continue
      }

      for (const {job, jobRunId} of jobs) {
        console.log(`[SIMPLE_WORKER] 📦 Processing job ${job.id}`)
        
        try {
          // Simple success - just complete the job quickly for testing
          await jobQueueService.completeJob(job.id, jobRunId, 1000, { 
            success: true, 
            message: 'Test job completed by simple worker' 
          })
          
          console.log(`[SIMPLE_WORKER] ✅ Job ${job.id} completed successfully`)
          
        } catch (error) {
          console.error(`[SIMPLE_WORKER] ❌ Job ${job.id} failed:`, error)
          await jobQueueService.failJob(job.id, jobRunId, error instanceof Error ? error.message : 'Unknown error', 1000)
        }
      }
      
    } catch (error) {
      console.error('[SIMPLE_WORKER] 💥 Worker error:', error)
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
  }
}

// Start the worker
processJobs().catch(error => {
  console.error('[SIMPLE_WORKER] 🔥 Fatal error:', error)
  process.exit(1)
})

console.log('[SIMPLE_WORKER] 🎯 Bulletproof worker started!')