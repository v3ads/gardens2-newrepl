'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Check } from 'lucide-react'
import { pwaManager } from '@/lib/pwa'
import { toast } from 'sonner'

export function PWAInstallButton() {
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    // Check initial state
    setCanInstall(pwaManager.canInstall())
    setIsInstalled(pwaManager.isAppInstalled())

    // Listen for changes
    const checkInstallability = () => {
      setCanInstall(pwaManager.canInstall())
      setIsInstalled(pwaManager.isAppInstalled())
    }

    // Check periodically for changes in install state
    const interval = setInterval(checkInstallability, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleInstall = async () => {
    if (!canInstall || isInstalling) return

    setIsInstalling(true)
    
    try {
      const success = await pwaManager.install()
      
      if (success) {
        toast.success('App installed successfully!')
        setIsInstalled(true)
        setCanInstall(false)
      } else {
        toast.error('Installation was cancelled')
      }
    } catch (error) {
      toast.error('Failed to install app')
      console.error('Installation error:', error)
    } finally {
      setIsInstalling(false)
    }
  }

  // Don't show button if already installed or can't install
  if (isInstalled || !canInstall) {
    return null
  }

  return (
    <Button
      onClick={handleInstall}
      disabled={isInstalling}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {isInstalling ? (
        <>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Installing...
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          Install App
        </>
      )}
    </Button>
  )
}

export function PWAStatus() {
  const [isStandalone, setIsStandalone] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    setIsStandalone(pwaManager.isRunningStandalone())
    setIsInstalled(pwaManager.isAppInstalled())
  }, [])

  if (!isStandalone && !isInstalled) {
    return null
  }

  return (
    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
      <Check className="w-4 h-4" />
      <span>Running as installed app</span>
    </div>
  )
}