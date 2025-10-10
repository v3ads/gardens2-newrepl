'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { AutoSyncTrigger } from '@/components/auto-sync-trigger'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <AutoSyncTrigger />
        {children}
        <Toaster 
          richColors 
          duration={3000}
          closeButton
          position="bottom-right"
        />
      </ThemeProvider>
    </SessionProvider>
  )
}