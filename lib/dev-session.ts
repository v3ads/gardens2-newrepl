// Development session helper for automatic login in dev environment
// PRODUCTION SAFETY CHECK
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === 'true') {
  console.error('🚨 SECURITY ALERT: DEV_SESSION enabled in PRODUCTION! This is a critical security vulnerability!')
  console.error('🚨 Set NEXT_PUBLIC_ENABLE_DEV_SESSION=false or remove it entirely in production')
  // In production, we could force exit here for maximum safety:
  // process.exit(1)
}

export const DEV_USER = {
  id: 'cmfpjob5t0000s60wpgzesze7', // Actual user ID from database 
  name: 'V Payman Shalaby',
  email: 'vipaymanshalaby@gmail.com',
  image: null,
  role: 'ADMIN'
}

export function isDevelopmentMode(): boolean {
  // PRODUCTION SAFETY: Only enable when explicitly allowed AND not in production
  const explicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === 'true'
  const notProduction = process.env.NODE_ENV !== 'production'
  
  const isDev = explicitlyEnabled && notProduction
  
  // Always log for security audit trail
  console.log('[DEV_SESSION] Environment check:', { 
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_ENABLE_DEV_SESSION: process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION,
    explicitlyEnabled,
    notProduction,
    isDev
  })
  
  // Security warning in production
  if (process.env.NODE_ENV === 'production' && explicitlyEnabled) {
    console.error('🚨 SECURITY WARNING: DEV_SESSION explicitly enabled in PRODUCTION! This is a security risk.')
  }
  
  return isDev
}

export function getDevSession() {
  if (!isDevelopmentMode()) return null
  
  return {
    user: DEV_USER,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
  }
}

export async function getSessionWithDevOverride() {
  // Import here to avoid circular dependencies
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/lib/auth')
  
  // Try to get real session first
  const realSession = await getServerSession(authOptions)
  
  // If we have a real session, use it
  if (realSession) {
    return realSession
  }
  
  // Otherwise, fall back to dev session if enabled
  if (isDevelopmentMode()) {
    console.log('[AUTH] Using DEV session override:', DEV_USER.email)
    return {
      user: DEV_USER,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  }
  
  return null
}