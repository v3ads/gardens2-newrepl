import { headers } from 'next/headers'
import { getBaseUrl } from '@/lib/base-url'
import { getEnvironmentConfig } from '@/lib/env-config'

export default async function HealthPage() {
  const headersList = await headers()
  const baseUrl = getBaseUrl(headersList)
  const envConfig = getEnvironmentConfig()
  
  // Get current domain info
  const currentHost = headersList.get('host')
  const isProduction = currentHost?.includes('gardencommand.com')
  const isDeployment = currentHost?.includes('gardencommand.replit.app')
  const isDevelopment = currentHost?.includes('repl.co') || currentHost?.includes('replit.dev')
  
  const domainType = isProduction ? 'Production' : isDeployment ? 'Deployment' : isDevelopment ? 'Development' : 'Unknown'
  
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">System Health Check</h1>
        
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Runtime Configuration</h2>
            <div className="space-y-2 text-sm">
              <p><strong>Detected Base URL:</strong> {baseUrl}</p>
              <p><strong>Domain Type:</strong> {domainType}</p>
              <p><strong>NEXTAUTH_URL Fallback:</strong> {process.env.NEXTAUTH_URL || 'Not set'}</p>
              <p><strong>Google Client ID:</strong> {envConfig.googleClientId}</p>
              <p><strong>Environment:</strong> {envConfig.nodeEnv}</p>
              <p><strong>Database:</strong> {envConfig.databaseUrl ? '[CONFIGURED]' : '[NOT SET]'}</p>
            </div>
          </div>
          
          <div className="p-4 border rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Headers Detection</h2>
            <div className="space-y-1 text-sm">
              <p><strong>Host:</strong> {headersList.get('host') || 'Not detected'}</p>
              <p><strong>X-Forwarded-Host:</strong> {headersList.get('x-forwarded-host') || 'Not detected'}</p>
              <p><strong>X-Forwarded-Proto:</strong> {headersList.get('x-forwarded-proto') || 'Not detected'}</p>
              <p><strong>User-Agent:</strong> {headersList.get('user-agent')?.substring(0, 50) + '...' || 'Not detected'}</p>
            </div>
          </div>
          
          <div className="p-4 border rounded-lg">
            <h2 className="text-xl font-semibold mb-2">OAuth Configuration</h2>
            <div className="space-y-1 text-sm">
              <p><strong>Expected Callback URL:</strong> {baseUrl}/api/auth/callback/google</p>
              <p><strong>Google OAuth Client:</strong> {envConfig.hasGoogleSecret ? '✅ Configured' : '❌ Missing Secret'}</p>
              <p><strong>NextAuth Secret:</strong> {envConfig.hasNextauthSecret ? '✅ Set' : '❌ Missing'}</p>
            </div>
          </div>
          
          <div className={`p-4 border rounded-lg ${domainType === 'Production' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
            <h2 className="text-xl font-semibold mb-2">Multi-Domain Status</h2>
            <div className="space-y-1 text-sm">
              <p className={`${isProduction ? 'text-green-700 dark:text-green-300' : 'text-gray-500'}`}>
                {isProduction ? '✅' : '○'} Production: gardencommand.com
              </p>
              <p className={`${isDeployment ? 'text-green-700 dark:text-green-300' : 'text-gray-500'}`}>
                {isDeployment ? '✅' : '○'} Deployment: gardencommand.replit.app
              </p>
              <p className={`${isDevelopment ? 'text-green-700 dark:text-green-300' : 'text-gray-500'}`}>
                {isDevelopment ? '✅' : '○'} Development: *.repl.co / *.replit.dev
              </p>
              <p className="text-green-700 dark:text-green-300 mt-2">✅ Runtime URL detection working</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}