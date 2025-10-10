import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'
// PRODUCTION SAFETY: Removed ensure-users import to prevent seed operations in production

// PRODUCTION SAFETY: Final runtime validation
if (process.env.NODE_ENV === 'production') {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === 'true') {
    console.error('🚨 PRODUCTION SECURITY ALERT: DEV_SESSION is enabled in PRODUCTION!')
    console.error('🚨 This will cause ALL users to login as vipaymanshalaby@gmail.com instead of themselves!')
    console.error('🚨 Remove NEXT_PUBLIC_ENABLE_DEV_SESSION from production environment immediately!')
  } else {
    console.log('✅ PRODUCTION SECURITY: DEV_SESSION correctly disabled')
  }
} else {
  console.log(`[AUTH] Environment: ${process.env.NODE_ENV}`)
  console.log(`[AUTH] DEV_SESSION flag: ${process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION}`)
}

// Enable trust host for dynamic hosts in Replit environment
process.env.AUTH_TRUST_HOST = "true"

// Fix NEXTAUTH_URL for Replit development environment
// This MUST be done before NextAuth reads the environment variable
if (process.env.NODE_ENV === 'development' && process.env.REPLIT_DOMAINS) {
  const replitDomain = process.env.REPLIT_DOMAINS.split(',')[0]
  const replitUrl = `https://${replitDomain}`

  // Override NEXTAUTH_URL for development in Replit
  // This ensures OAuth callbacks work correctly
  process.env.NEXTAUTH_URL = replitUrl
  process.env.NEXTAUTH_URL_INTERNAL = replitUrl

  // Only log OAuth domain in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[AUTH] Using Replit domain for OAuth:', replitUrl)
  }
}

// Environment validation with sanitization
function clean(v?: string) {
  return (v ?? '').trim().replace(/^"|"$/g, '')
}

// Support both naming conventions for Google OAuth credentials
const GOOGLE_CLIENT_ID = clean(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ID)
const GOOGLE_CLIENT_SECRET = clean(process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET)
const NEXTAUTH_SECRET = clean(process.env.NEXTAUTH_SECRET)

// Validate required environment variables (log warnings instead of throwing)
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !NEXTAUTH_SECRET) {
  console.error('❌ FATAL: Missing required environment variables for Google OAuth')
  console.error('Missing:', {
    googleClientId: !GOOGLE_CLIENT_ID,
    googleClientSecret: !GOOGLE_CLIENT_SECRET,
    nextAuthSecret: !NEXTAUTH_SECRET
  })
  console.error('💡 Add these secrets in Replit Deployment Secrets:')
  console.error('  - GOOGLE_CLIENT_ID (or GOOGLE_ID)')
  console.error('  - GOOGLE_CLIENT_SECRET (or GOOGLE_SECRET)')
  console.error('  - NEXTAUTH_SECRET')

  // Don't throw - let the startup script validation handle it
  // This prevents NextAuth initialization from crashing the entire app
}

// Log masked env check at boot
function mask(v?: string) {
  if (!v) return 'MISSING'
  const t = v.trim()
  if (t.length <= 8) return '****'
  return t.slice(0, 6) + '...' + t.slice(-6)
}

// Only log in development to prevent credential exposure in production
if (process.env.NODE_ENV === 'development') {
  console.log('[ENV CHECK]', {
    GID: mask(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ID),
    GSEC: mask(process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET),
    NEXTAUTH_SECRET: mask(process.env.NEXTAUTH_SECRET),
    NEXTAUTH_URL: process.env.NEXTAUTH_URL
  })
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }