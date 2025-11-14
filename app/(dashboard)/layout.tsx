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
    <AnalyticsProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 overflow-auto">
            <div className="container mx-auto p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AnalyticsProvider>
  )
}