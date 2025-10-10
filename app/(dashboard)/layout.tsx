import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { AnalyticsProvider } from '@/contexts/analytics-context'
import { SyncStatusProvider } from '@/contexts/sync-status-context'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // In development mode, skip auth check
  if (process.env.NODE_ENV !== 'development') {
    const user = await getCurrentUser()

    if (!user) {
      redirect('/login')
    }
  }

  return (
    <SyncStatusProvider>
      <AnalyticsProvider>
        <div className="min-h-screen bg-background">
          <Header />
          <div className="flex">
            <aside className="hidden md:block w-64 min-h-[calc(100vh-3.5rem)] border-r">
              <Sidebar />
            </aside>
            <main className="flex-1 p-3 md:p-6 w-full min-w-0">
              {children}
            </main>
          </div>
        </div>
      </AnalyticsProvider>
    </SyncStatusProvider>
  )
}