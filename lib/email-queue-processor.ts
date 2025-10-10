/**
 * EMAIL QUEUE PROCESSOR
 * 
 * Background service that processes the email retry queue periodically.
 * Handles retries with exponential backoff and queue maintenance.
 */

import { emailRetryQueue } from './email-retry-queue'

export class EmailQueueProcessor {
  private isRunning = false
  private intervalId: NodeJS.Timeout | null = null

  /**
   * Start the queue processor with regular intervals
   */
  start(intervalMinutes: number = 5): void {
    if (this.isRunning) {
      console.log('[EMAIL_QUEUE_PROCESSOR] Already running')
      return
    }

    console.log(`[EMAIL_QUEUE_PROCESSOR] Starting processor with ${intervalMinutes} minute intervals`)
    this.isRunning = true

    // Process immediately
    this.processQueue()

    // Set up regular processing
    this.intervalId = setInterval(() => {
      this.processQueue()
    }, intervalMinutes * 60 * 1000)
  }

  /**
   * Stop the queue processor
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    console.log('[EMAIL_QUEUE_PROCESSOR] Stopping processor')
    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Process the email retry queue
   */
  private async processQueue(): Promise<void> {
    try {
      console.log('[EMAIL_QUEUE_PROCESSOR] Processing email retry queue...')
      await emailRetryQueue.processQueue()
      
      // Log queue statistics
      const stats = await emailRetryQueue.getQueueStats()
      console.log('[EMAIL_QUEUE_PROCESSOR] Queue stats:', stats)
      
    } catch (error) {
      console.error('[EMAIL_QUEUE_PROCESSOR] Error processing queue:', error)
    }
  }

  /**
   * Get processor status
   */
  getStatus(): { isRunning: boolean; intervalMinutes?: number } {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalId ? 5 : undefined
    }
  }

  /**
   * Process queue once manually
   */
  async processOnce(): Promise<void> {
    await this.processQueue()
  }
}

export const emailQueueProcessor = new EmailQueueProcessor()

// Auto-start the processor in production
if (process.env.NODE_ENV === 'production') {
  emailQueueProcessor.start(5) // Process every 5 minutes
}