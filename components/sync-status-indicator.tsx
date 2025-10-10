'use client'

import { useSyncStatus } from '@/contexts/sync-status-context'
import { useSession } from '@/hooks/use-session-override'

export function SyncStatusIndicator() {
  const { status } = useSyncStatus()
  const { data: session } = useSession()

  // Only show for vipaymanshalaby@gmail.com
  if (session?.user?.email !== 'vipaymanshalaby@gmail.com') {
    return null
  }

  // Show indicator if syncing OR if there's progress info
  if (!status.isSyncing && !status.syncProgress) {
    return null
  }

  return (
    <div className="flex items-center space-x-1 sm:space-x-2 px-2 py-1 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 max-w-fit">
      <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse flex-shrink-0"></div>
      <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 animate-pulse whitespace-nowrap">
        SYNCING
      </span>
      {status.syncProgress && (
        <span className="text-xs text-muted-foreground max-w-24 sm:max-w-32 truncate" title={status.syncProgress}>
          {status.syncProgress}
        </span>
      )}
      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <span className="text-xs text-red-500 hidden sm:inline">
          [{status.isSyncing ? 'Y' : 'N'}] {status.syncType || 'none'}
        </span>
      )}
    </div>
  )
}