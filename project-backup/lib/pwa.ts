'use client'

// PWA utilities for managing service worker and app installation

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export class PWAManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null
  private isInstalled = false
  private isStandalone = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.init()
    }
  }

  private init() {
    // Check if app is already installed
    this.isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator as any).standalone ||
                       document.referrer.includes('android-app://') ||
                       window.matchMedia('(display-mode: fullscreen)').matches ||
                       window.matchMedia('(display-mode: minimal-ui)').matches

    this.isInstalled = this.isStandalone

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA: beforeinstallprompt event fired')
      e.preventDefault()
      this.deferredPrompt = e as BeforeInstallPromptEvent
      
      // Dispatch custom event to notify components
      window.dispatchEvent(new CustomEvent('pwa-installable'))
    })

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('PWA: App installed')
      this.isInstalled = true
      this.deferredPrompt = null
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('pwa-installed'))
    })

    // Check if running on mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (isMobile) {
      console.log('PWA: Mobile device detected')
    }
  }

  // Check if app can be installed
  canInstall(): boolean {
    return this.deferredPrompt !== null && !this.isInstalled
  }

  // Check if app is already installed
  isAppInstalled(): boolean {
    return this.isInstalled
  }

  // Check if running in standalone mode
  isRunningStandalone(): boolean {
    return this.isStandalone
  }

  // Trigger install prompt
  async install(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false
    }

    try {
      await this.deferredPrompt.prompt()
      const { outcome } = await this.deferredPrompt.userChoice
      
      if (outcome === 'accepted') {
        this.deferredPrompt = null
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error during app installation:', error)
      return false
    }
  }

  // Register service worker
  async registerServiceWorker(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      console.log('Service workers not supported')
      return false
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      })

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New update available
              this.showUpdateNotification()
            }
          })
        }
      })

      console.log('Service Worker registered successfully')
      return true
    } catch (error) {
      console.error('Service Worker registration failed:', error)
      return false
    }
  }

  private showUpdateNotification() {
    // You can customize this to show a notification to the user
    // about app updates being available
    if (window.confirm('New version available! Reload to update?')) {
      window.location.reload()
    }
  }

  // Check for app updates
  async checkForUpdates(): Promise<void> {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          await registration.update()
        }
      } catch (error) {
        console.error('Error checking for updates:', error)
      }
    }
  }
}

// Create singleton instance
export const pwaManager = new PWAManager()