'use client'

import { useEffect } from 'react'
import { pwaManager } from '@/lib/pwa'

export function PWAInit() {
  useEffect(() => {
    // Register service worker when component mounts
    pwaManager.registerServiceWorker()

    // Check for updates periodically
    const checkUpdatesInterval = setInterval(() => {
      pwaManager.checkForUpdates()
    }, 60000) // Check every minute

    return () => clearInterval(checkUpdatesInterval)
  }, [])

  return null
}