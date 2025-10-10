// Environment configuration helper for multi-domain support
export function getEnvironmentConfig() {
  // Log environment variables (masked for security)
  const config = {
    nodeEnv: process.env.NODE_ENV,
    nextauthUrl: process.env.NEXTAUTH_URL,
    googleClientId: process.env.GOOGLE_CLIENT_ID ? `****${process.env.GOOGLE_CLIENT_ID.slice(-6)}` : 'Not set',
    hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasNextauthSecret: !!process.env.NEXTAUTH_SECRET,
    databaseUrl: process.env.DATABASE_URL?.includes('localhost') ? 'Local PostgreSQL' : 'Production PostgreSQL'
  }
  
  console.log('Environment Configuration:', config)
  return config
}

// Startup validation
export function validateEnvironment() {
  const missing = []
  
  if (!process.env.NEXTAUTH_URL) missing.push('NEXTAUTH_URL')
  if (!process.env.NEXTAUTH_SECRET) missing.push('NEXTAUTH_SECRET')
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID')
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET')
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  
  return true
}