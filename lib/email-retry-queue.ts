/**
 * EMAIL RETRY QUEUE SERVICE
 * 
 * Handles failed email notifications with automatic retry logic and exponential backoff.
 * Integrates with the existing EmailService to provide reliable email delivery.
 */

import { prisma, withPrismaRetry } from './prisma'
import { EmailService } from './email-service'

interface QueuedEmail {
  id: string
  emailType: string
  recipientEmail: string
  subject: string
  htmlContent: string
  textContent: string
  attachmentData: string | null
  retryCount: number
  maxRetries: number
  nextRetryAt: Date
  lastError: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}

interface EmailAttachment {
  name: string
  content: string // base64 encoded content
}

export class EmailRetryQueue {
  private emailService: EmailService
  private isProcessing = false

  constructor() {
    this.emailService = new EmailService()
  }

  /**
   * Add a failed email to the retry queue
   */
  async addToQueue(
    emailType: string,
    recipientEmail: string,
    subject: string,
    htmlContent: string,
    textContent: string,
    attachments?: EmailAttachment[],
    maxRetries: number = 3
  ): Promise<string> {
    try {
      console.log(`[EMAIL_RETRY_QUEUE] Adding ${emailType} email to retry queue for ${recipientEmail}`)

      // Calculate next retry time (immediate first retry, then exponential backoff)
      const nextRetryAt = new Date(Date.now() + 60000) // Retry in 1 minute

      const result = await withPrismaRetry(() => prisma.$queryRaw`
        INSERT INTO email_retry_queue (
          "emailType", "recipientEmail", subject, "htmlContent", "textContent", 
          "attachmentData", "maxRetries", "nextRetryAt", status
        ) VALUES (
          ${emailType}, ${recipientEmail}, ${subject}, ${htmlContent}, ${textContent},
          ${attachments ? JSON.stringify(attachments) : null}, ${maxRetries}, ${nextRetryAt}, 'pending'
        ) RETURNING id
      `) as any[]

      const queueId = result[0]?.id
      console.log(`[EMAIL_RETRY_QUEUE] ✅ Added email to queue with ID: ${queueId}`)
      
      return queueId
    } catch (error) {
      console.error('[EMAIL_RETRY_QUEUE] ❌ Failed to add email to queue:', error)
      throw error
    }
  }

  /**
   * Process pending emails in the retry queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('[EMAIL_RETRY_QUEUE] Already processing queue, skipping...')
      return
    }

    this.isProcessing = true
    
    try {
      console.log('[EMAIL_RETRY_QUEUE] 🔄 Processing retry queue...')

      // Get emails ready for retry
      const pendingEmails = await withPrismaRetry(() => prisma.$queryRaw`
        SELECT * FROM email_retry_queue 
        WHERE status = 'pending' 
        AND "nextRetryAt" <= NOW()
        AND "retryCount" < "maxRetries"
        ORDER BY "createdAt" ASC
        LIMIT 10
      `) as QueuedEmail[]

      if (pendingEmails.length === 0) {
        console.log('[EMAIL_RETRY_QUEUE] No emails pending retry')
        return
      }

      console.log(`[EMAIL_RETRY_QUEUE] Found ${pendingEmails.length} emails to retry`)

      for (const email of pendingEmails) {
        await this.retryEmail(email)
      }

      // Clean up old successful/failed emails (older than 7 days)
      await this.cleanupOldEmails()

    } catch (error) {
      console.error('[EMAIL_RETRY_QUEUE] ❌ Error processing queue:', error)
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Retry a specific email
   */
  private async retryEmail(email: QueuedEmail): Promise<void> {
    try {
      console.log(`[EMAIL_RETRY_QUEUE] Retrying email ${email.id} (attempt ${email.retryCount + 1}/${email.maxRetries})`)

      // Mark as processing
      await withPrismaRetry(() => prisma.$executeRaw`
        UPDATE email_retry_queue 
        SET status = 'processing', "updatedAt" = NOW()
        WHERE id = ${email.id}
      `)

      // Parse attachments if any
      let attachments: EmailAttachment[] | undefined
      if (email.attachmentData) {
        try {
          attachments = JSON.parse(email.attachmentData)
        } catch (parseError) {
          console.error('[EMAIL_RETRY_QUEUE] Failed to parse attachment data:', parseError)
        }
      }

      // Attempt to send email
      const success = await this.emailService.sendEmail({
        to: email.recipientEmail,
        subject: email.subject,
        htmlContent: email.htmlContent,
        textContent: email.textContent,
        attachments
      })

      if (success) {
        // Mark as successful
        await withPrismaRetry(() => prisma.$executeRaw`
          UPDATE email_retry_queue 
          SET status = 'success', "updatedAt" = NOW()
          WHERE id = ${email.id}
        `)
        console.log(`[EMAIL_RETRY_QUEUE] ✅ Successfully sent email ${email.id}`)
      } else {
        // Increment retry count and schedule next retry
        const newRetryCount = email.retryCount + 1
        const isMaxRetriesReached = newRetryCount >= email.maxRetries

        if (isMaxRetriesReached) {
          // Mark as permanently failed
          await withPrismaRetry(() => prisma.$executeRaw`
            UPDATE email_retry_queue 
            SET status = 'failed', "retryCount" = ${newRetryCount}, 
                "lastError" = 'Max retries reached', "updatedAt" = NOW()
            WHERE id = ${email.id}
          `)
          console.log(`[EMAIL_RETRY_QUEUE] ❌ Email ${email.id} permanently failed after ${newRetryCount} attempts`)
        } else {
          // Schedule next retry with exponential backoff
          const backoffMinutes = Math.pow(2, newRetryCount) * 5 // 5, 10, 20 minutes
          const nextRetryAt = new Date(Date.now() + backoffMinutes * 60000)

          await withPrismaRetry(() => prisma.$executeRaw`
            UPDATE email_retry_queue 
            SET status = 'pending', "retryCount" = ${newRetryCount}, 
                "nextRetryAt" = ${nextRetryAt}, "lastError" = 'Send failed, will retry',
                "updatedAt" = NOW()
            WHERE id = ${email.id}
          `)
          console.log(`[EMAIL_RETRY_QUEUE] ⏰ Email ${email.id} scheduled for retry in ${backoffMinutes} minutes`)
        }
      }

    } catch (error) {
      console.error(`[EMAIL_RETRY_QUEUE] ❌ Error retrying email ${email.id}:`, error)
      
      // Mark as failed with error details
      await withPrismaRetry(() => prisma.$executeRaw`
        UPDATE email_retry_queue 
        SET status = 'failed', "lastError" = ${error instanceof Error ? error.message : String(error)},
            "updatedAt" = NOW()
        WHERE id = ${email.id}
      `)
    }
  }

  /**
   * Clean up old successful and failed emails
   */
  private async cleanupOldEmails(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago

      const result = await withPrismaRetry(() => prisma.$executeRaw`
        DELETE FROM email_retry_queue 
        WHERE "createdAt" < ${cutoffDate} 
        AND status IN ('success', 'failed')
      `)

      console.log(`[EMAIL_RETRY_QUEUE] 🧹 Cleaned up old emails (older than 7 days)`)
    } catch (error) {
      console.error('[EMAIL_RETRY_QUEUE] Failed to cleanup old emails:', error)
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number
    processing: number
    success: number
    failed: number
    total: number
  }> {
    try {
      const stats = await prisma.$queryRaw`
        SELECT 
          status,
          COUNT(*) as count
        FROM email_retry_queue 
        GROUP BY status
      ` as { status: string; count: number }[]

      const result = {
        pending: 0,
        processing: 0,
        success: 0,
        failed: 0,
        total: 0
      }

      stats.forEach(stat => {
        const count = Number(stat.count)
        result.total += count
        
        switch (stat.status) {
          case 'pending':
            result.pending = count
            break
          case 'processing':
            result.processing = count
            break
          case 'success':
            result.success = count
            break
          case 'failed':
            result.failed = count
            break
        }
      })

      return result
    } catch (error) {
      console.error('[EMAIL_RETRY_QUEUE] Failed to get queue stats:', error)
      return { pending: 0, processing: 0, success: 0, failed: 0, total: 0 }
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    await prisma.$disconnect()
  }
}

export const emailRetryQueue = new EmailRetryQueue()