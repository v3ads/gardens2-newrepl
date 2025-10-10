'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Download, X, Smartphone } from 'lucide-react'
import { pwaManager } from '@/lib/pwa'

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check device type
    const userAgent = navigator.userAgent
    const iOS = /iPad|iPhone|iPod/.test(userAgent)
    setIsIOS(iOS)

    // Check if already installed
    const installed = pwaManager.isAppInstalled()
    setIsInstalled(installed)

    // If already installed, don't show prompt
    if (installed) {
      return
    }

    // Check if can be installed (Chrome/Edge)
    const checkInstallable = () => {
      const canInstall = pwaManager.canInstall()
      setIsInstallable(canInstall)
      
      // Show prompt if installable or on iOS
      if (canInstall || iOS) {
        // Don't show immediately - wait a bit for user to engage
        const timer = setTimeout(() => {
          const hasSeenPrompt = localStorage.getItem('pwa-install-prompt-seen')
          if (!hasSeenPrompt) {
            setShowPrompt(true)
          }
        }, 3000) // Show after 3 seconds

        return () => clearTimeout(timer)
      }
    }

    checkInstallable()

    // Listen for PWA events
    const handleInstallable = () => {
      console.log('PWA: Installable event received')
      checkInstallable()
    }

    const handleInstalled = () => {
      console.log('PWA: Installed event received')
      setIsInstalled(true)
      setShowPrompt(false)
    }

    window.addEventListener('pwa-installable', handleInstallable)
    window.addEventListener('pwa-installed', handleInstalled)
    window.addEventListener('beforeinstallprompt', handleInstallable)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable)
      window.removeEventListener('pwa-installed', handleInstalled)
      window.removeEventListener('beforeinstallprompt', handleInstallable)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (isInstallable) {
      // Use browser's native install prompt
      const success = await pwaManager.install()
      if (success) {
        setShowPrompt(false)
        localStorage.setItem('pwa-install-prompt-seen', 'true')
      }
    } else if (isIOS) {
      // Show iOS instructions
      setShowPrompt(false)
      // You could show a modal with iOS instructions here
      alert('To install this app on iOS:\n1. Tap the Share button in Safari\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm')
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('pwa-install-prompt-seen', 'true')
  }

  // Don't show if already installed or no support
  if (isInstalled || (!isInstallable && !isIOS) || !showPrompt) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
      <Card className="bg-background/95 backdrop-blur-sm border-primary/20 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">Install App</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isIOS 
                  ? 'Add to your home screen for easy access'
                  : 'Install Command Center for offline access and better performance'
                }
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleInstall}
                  className="h-8 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  {isIOS ? 'Show How' : 'Install'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}