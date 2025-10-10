import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { PWAInit } from './pwa-init'
import { PWAInstallPrompt } from '@/components/pwa-install-prompt'

export { viewport } from './viewport'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'https://gardencommand.com'),
  title: 'Cynthia Gardens Command Center',
  description: 'Modern management command center with AI-powered features',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Command Center'
  },
  formatDetection: {
    telephone: false
  },
  openGraph: {
    type: 'website',
    title: 'Cynthia Gardens Command Center',
    description: 'Modern management command center with AI-powered features',
    images: ['/icon-512x512.png']
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#22c55e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Command Center" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="apple-touch-startup-image" href="/icon-512x512.png" />
        <link rel="icon" href="/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={inter.className}>
        <Providers>
          <PWAInit />
          {children}
          <PWAInstallPrompt />
        </Providers>
      </body>
    </html>
  )
}