'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Database, Settings, RefreshCw } from 'lucide-react'
import { useState } from 'react'

interface AnalyticsEmptyStateProps {
  category: string
  isConnected?: boolean
}

export function AnalyticsEmptyState({ category, isConnected = false }: AnalyticsEmptyStateProps) {
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleConnectData = () => {
    // Route to data connections settings page
    router.push('/settings/data-connections')
  }

  const handleRefreshData = async () => {
    setIsRefreshing(true)
    try {
      // In the future, this would trigger data sync from AppFolio
      // For now, just simulate the refresh process
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Eventually this would refresh the page or update data state
      window.location.reload()
    } catch (error) {
      console.error('Failed to refresh data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full text-center">
        <CardHeader className="pb-4">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-muted border-2 border-dashed border-muted-foreground/20">
              <Database className="h-12 w-12 text-muted-foreground/50" />
            </div>
          </div>
          <CardTitle className="text-xl">
            {isConnected ? 'No Analytics Data' : 'No Data Connected'}
          </CardTitle>
          <CardDescription className="text-base">
            {isConnected 
              ? `Refresh data to view ${category} metrics.`
              : `Connect data to view ${category} metrics.`
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            {isConnected 
              ? `Your AppFolio data is connected. Sync your latest ${category.toLowerCase()} data to view comprehensive analytics and insights.`
              : `To see comprehensive analytics and insights for ${category.toLowerCase()}, you'll need to connect your property management system or upload your data.`
            }
          </p>
          {isConnected ? (
            <Button 
              onClick={handleRefreshData}
              className="w-full"
              size="lg"
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Syncing Data...' : 'Refresh Data'}
            </Button>
          ) : (
            <Button 
              onClick={handleConnectData}
              className="w-full"
              size="lg"
            >
              <Settings className="h-4 w-4 mr-2" />
              Connect Data
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}