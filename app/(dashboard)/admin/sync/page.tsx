'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function AdminSyncPage() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const { toast } = useToast()

  const handleManualSync = async () => {
    setIsSyncing(true)
    setSyncStatus('syncing')
    setSyncMessage('Starting AppFolio data sync...')

    try {
      const response = await fetch('/api/admin/sync/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setSyncStatus('success')
        setSyncMessage(data.message || 'Sync completed successfully!')
        toast({
          title: 'Sync Successful',
          description: 'AppFolio data has been synced successfully.',
        })
      } else {
        setSyncStatus('error')
        setSyncMessage(data.error || data.message || 'Sync failed')
        toast({
          variant: 'destructive',
          title: 'Sync Failed',
          description: data.error || 'An error occurred during sync',
        })
      }
    } catch (error) {
      setSyncStatus('error')
      setSyncMessage(error instanceof Error ? error.message : 'Unknown error occurred')
      toast({
        variant: 'destructive',
        title: 'Sync Error',
        description: 'Failed to trigger sync operation',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-400 mb-2">Admin Sync Control</h1>
        <p className="text-muted-foreground">
          Manually trigger AppFolio data synchronization to populate analytics
        </p>
      </div>

      <Card className="border-green-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-green-400" />
            Manual Data Sync
          </CardTitle>
          <CardDescription>
            This will fetch the latest data from AppFolio and update your analytics database.
            The process may take several minutes to complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {syncStatus !== 'idle' && (
            <div className={`p-4 rounded-lg border ${
              syncStatus === 'syncing' ? 'bg-blue-500/10 border-blue-500/20' :
              syncStatus === 'success' ? 'bg-green-500/10 border-green-500/20' :
              'bg-red-500/10 border-red-500/20'
            }`}>
              <div className="flex items-start gap-3">
                {syncStatus === 'syncing' && <Loader2 className="h-5 w-5 animate-spin text-blue-400 mt-0.5" />}
                {syncStatus === 'success' && <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5" />}
                {syncStatus === 'error' && <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />}
                <div className="flex-1">
                  <Badge 
                    variant={
                      syncStatus === 'syncing' ? 'secondary' :
                      syncStatus === 'success' ? 'default' :
                      'destructive'
                    }
                    className="mb-2"
                  >
                    {syncStatus === 'syncing' ? 'Syncing...' :
                     syncStatus === 'success' ? 'Success' :
                     'Error'}
                  </Badge>
                  <p className="text-sm text-foreground">{syncMessage}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>What this does:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Fetches latest lease, unit, and tenant data from AppFolio</li>
              <li>Processes and stores the data in your analytics database</li>
              <li>Calculates occupancy, financial, and operational metrics</li>
              <li>Updates all dashboard analytics</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="w-full"
            data-testid="button-trigger-sync"
          >
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Trigger Manual Sync
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      <div className="mt-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-400 mb-1">Important Notes:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li>The sync process may take 5-10 minutes to complete</li>
              <li>Only run this when you need to refresh your analytics data</li>
              <li>Automatic daily syncs are scheduled for 7:00 AM EST</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
