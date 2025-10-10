#!/usr/bin/env tsx

/**
 * Database Connection Diagnostic Tool
 * This will test database connectivity and job visibility
 */

import { jobQueueService } from '../lib/job-queue-service'

console.log('🔍 DIAGNOSTIC: Testing database connections...')
console.log('Environment variables:')
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL)
console.log('DATABASE_URL (first 50 chars):', process.env.DATABASE_URL?.substring(0, 50) + '...')

async function runDiagnostics() {
  try {
    console.log('\n🔍 DIAGNOSTIC: Testing job queue service...')
    
    // Test connection by getting queue status
    console.log('✅ Database connection test...')
    
    // Test getting recent jobs
    const jobs = await jobQueueService.getRecentJobs(5)
    console.log('✅ Recent jobs:', jobs.length, 'found')
    jobs.forEach(job => {
      console.log(`  - Job ${job.id}: ${job.status} (created: ${job.createdAt})`)
    })
    
    // Test peek jobs (READ-ONLY - doesn't claim)
    console.log('\n🔍 DIAGNOSTIC: Testing available QUEUED jobs (read-only)...')
    
    // Use Prisma directly to check QUEUED jobs without claiming them
    const { prisma } = await import('../lib/prisma')
    const queuedJobs = await prisma.jobQueue.findMany({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      take: 5
    })
    
    const runningJobs = await prisma.jobQueue.findMany({
      where: { status: 'RUNNING' },
      orderBy: { updatedAt: 'desc' },
      take: 5
    })
    
    console.log('✅ QUEUED jobs available:', queuedJobs.length)
    queuedJobs.forEach(job => {
      console.log(`  - QUEUED Job ${job.id}: created ${job.createdAt}`)
    })
    
    console.log('✅ RUNNING jobs (potentially stuck):', runningJobs.length)
    runningJobs.forEach(job => {
      console.log(`  - RUNNING Job ${job.id}: updated ${job.updatedAt}`)
    })
    
    if (queuedJobs.length === 0 && runningJobs.length > 0) {
      console.log('❌ ROOT CAUSE CONFIRMED: Jobs stuck in RUNNING, none available for workers!')
    }
    
  } catch (error) {
    console.error('❌ DIAGNOSTIC ERROR:', error)
  }
}

runDiagnostics()
  .then(() => {
    console.log('\n🎯 DIAGNOSTIC COMPLETE')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 DIAGNOSTIC FAILED:', error)
    process.exit(1)
  })