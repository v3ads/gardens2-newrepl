'use client'

import { useSession as useNextAuthSession } from 'next-auth/react'
import { DEV_USER, isDevelopmentMode } from '@/lib/dev-session'
import { useEffect, useState } from 'react'

export function useSession() {
  const { data: realSession, status } = useNextAuthSession()
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // PRODUCTION SAFETY: Never use dev session in production
  const isProduction = process.env.NODE_ENV === 'production'
  const shouldUseDev = !isProduction && isDevelopmentMode()
  
  // Server-side rendering compatibility - always return consistent data
  if (!isClient) {
    // Only use dev session if explicitly enabled and not in production
    if (shouldUseDev) {
      return {
        data: {
          user: DEV_USER,
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        status: 'authenticated' as const
      }
    }
    return { data: null, status: 'loading' as const }
  }

  // Only use dev session if explicitly enabled and not in production
  if (shouldUseDev && !realSession && status === 'unauthenticated') {
    return {
      data: {
        user: DEV_USER,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      status: 'authenticated' as const
    }
  }

  // Always return real session in production or when dev override disabled
  return { data: realSession, status }
}