'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertCircle, CheckCircle, Database, RefreshCw, Search, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface ReportCheck {
  id: string
  in_registry: boolean
  enabled: boolean
  table: string
  table_exists: boolean
  row_count: number
  last_sync_at: string | null
  fallback_checked?: boolean
  fallback?: ReportCheck
}

interface CheckOptionalResponse {
  ok: boolean
  snapshot: string | null
  reports: ReportCheck[]
}

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development'

export default function DataConnectionsPage() {
  const [optionalReports, setOptionalReports] = useState<CheckOptionalResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const checkOptionalReports = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/integrations/appfolio/check-optional')
      
      if (!response.ok) {
        if (response.status === 404) {
          toast.error('Diagnostic endpoint not available in production')
          return
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const data: CheckOptionalResponse = await response.json()
      setOptionalReports(data)
      setIsOpen(true)
      toast.success('Optional reports checked successfully')
    } catch (error) {
      console.error('Error checking optional reports:', error)
      toast.error('Failed to check optional reports')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusIcon = (exists: boolean, enabled: boolean) => {
    if (exists && enabled) return <CheckCircle className="h-4 w-4 text-green-500" />
    if (exists && !enabled) return <AlertCircle className="h-4 w-4 text-yellow-500" />
    return <XCircle className="h-4 w-4 text-red-500" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Connections</h1>
        <p className="text-muted-foreground">
          Configure AppFolio integration and sync settings
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              AppFolio Integration
            </CardTitle>
            <CardDescription>
              Primary data source for property management data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Connected
              </Badge>
              <span className="text-sm text-muted-foreground">Active since setup</span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Reports Enabled:</span>
                <span className="font-medium">25+ reports</span>
              </div>
              <div className="flex justify-between">
                <span>Last Sync:</span>
                <span className="font-medium">Daily at 7:00 AM ET</span>
              </div>
              <div className="flex justify-between">
                <span>Data Freshness:</span>
                <span className="font-medium">Current</span>
              </div>
            </div>

            {isDevelopment && (
              <div className="pt-4 border-t">
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={checkOptionalReports}
                      disabled={isLoading}
                      className="w-full"
                    >
                      {isLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      Check Optional Reports
                    </Button>
                  </DialogTrigger>
                  
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Optional AppFolio Reports Status</DialogTitle>
                      <DialogDescription>
                        Development diagnostic for optional report availability
                        {optionalReports?.snapshot && (
                          <span className="block mt-1">
                            Latest snapshot: <code className="text-xs bg-muted px-1 py-0.5 rounded">{optionalReports.snapshot}</code>
                          </span>
                        )}
                      </DialogDescription>
                    </DialogHeader>
                    
                    {optionalReports && (
                      <div className="space-y-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Report ID</TableHead>
                              <TableHead>In Registry</TableHead>
                              <TableHead>Enabled</TableHead>
                              <TableHead>Raw Table</TableHead>
                              <TableHead>Row Count</TableHead>
                              <TableHead>Last Sync</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {optionalReports.reports.map((report) => (
                              <TableRow key={report.id}>
                                <TableCell className="font-mono text-sm">{report.id}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(report.in_registry, report.enabled)}
                                    {report.in_registry ? 'Yes' : 'No'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(report.enabled, report.enabled)}
                                    {report.enabled ? 'Yes' : 'No'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(report.table_exists, true)}
                                    <span className="font-mono text-xs">
                                      {report.table_exists ? '✓' : '—'}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {report.row_count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {formatDate(report.last_sync_at)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        {/* Show fallback information for screening_decisions */}
                        {optionalReports.reports.some(r => r.fallback_checked && r.fallback) && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-medium text-blue-900 mb-2">Fallback Available</h4>
                            {optionalReports.reports
                              .filter(r => r.fallback_checked && r.fallback)
                              .map(report => (
                                <div key={`${report.id}-fallback`} className="text-sm text-blue-800">
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 mr-2">
                                    Using {report.fallback!.id} as alternative
                                  </Badge>
                                  <span>
                                    {report.fallback!.row_count.toLocaleString()} records available
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Show summary */}
                        <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                          <strong>Summary:</strong> 
                          {optionalReports.reports.filter(r => r.in_registry && r.enabled).length} of {optionalReports.reports.length} reports are enabled in registry. 
                          {optionalReports.reports.filter(r => r.table_exists).length} of {optionalReports.reports.length} tables exist in database.
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Data Sync Status
            </CardTitle>
            <CardDescription>
              Automated daily synchronization status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Healthy
              </Badge>
              <span className="text-sm text-muted-foreground">All systems operational</span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Next Sync:</span>
                <span className="font-medium">Tomorrow 7:00 AM ET</span>
              </div>
              <div className="flex justify-between">
                <span>Sync Method:</span>
                <span className="font-medium">Webhook + Manual</span>
              </div>
              <div className="flex justify-between">
                <span>Email Notifications:</span>
                <span className="font-medium">Enabled</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Google Sheets Integration
            </CardTitle>
            <CardDescription>
              Master tenant/unit data source
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Connected
              </Badge>
              <span className="text-sm text-muted-foreground">Auto-sync enabled</span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Source:</span>
                <span className="font-medium">Master CSV</span>
              </div>
              <div className="flex justify-between">
                <span>Update Frequency:</span>
                <span className="font-medium">Daily</span>
              </div>
              <div className="flex justify-between">
                <span>Records:</span>
                <span className="font-medium">200 units</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}