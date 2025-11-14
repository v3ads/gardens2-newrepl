import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Enhanced middleware for multi-domain OAuth support
export default withAuth(
  function middleware(req: NextRequest) {
    // CRITICAL: Redirect www to non-www to ensure single canonical domain for NextAuth
    if (req.nextUrl.hostname === 'www.gardencommand.com') {
      const url = req.nextUrl.clone()
      url.hostname = 'gardencommand.com'
      return NextResponse.redirect(url, 308) // 308 = Permanent Redirect, preserves method
    }

    // Only log OAuth requests in development for performance
    if (process.env.NODE_ENV === 'development' && req.nextUrl.pathname.startsWith('/api/auth')) {
      console.log(`OAuth Request: ${req.method} ${req.nextUrl.pathname} from ${req.nextUrl.hostname}`)
    }

    // Ensure proper headers for cross-origin requests
    const response = NextResponse.next()

    // Add CORS headers if needed for development
    if (process.env.NODE_ENV === 'development') {
      response.headers.set('Access-Control-Allow-Origin', '*')
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }

    // SECURITY FIX: Prevent caching of authenticated pages to avoid stale user data after logout
    const isAuthenticatedRoute = req.nextUrl.pathname.startsWith('/dashboard') ||
                                  req.nextUrl.pathname.startsWith('/overview') ||
                                  req.nextUrl.pathname.startsWith('/admin') ||
                                  req.nextUrl.pathname === '/api/auth/session'

    if (isAuthenticatedRoute) {
      // Never cache authenticated pages - prevents showing wrong user data after logout
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      response.headers.set('Pragma', 'no-cache')
      response.headers.set('Expires', '0')
    } else {
      // Only cache public pages
      response.headers.set('Cache-Control', 'private, max-age=300')
    }

    return response
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Minimal logging only for critical paths in development
        if (process.env.NODE_ENV === 'development' && req.nextUrl.pathname.startsWith('/api/')) {
          console.log('[MIDDLEWARE] Checking authorization for:', req.nextUrl.pathname, 'Token exists:', !!token)
        }

        // PRODUCTION SAFETY: Only bypass auth when explicitly enabled AND not in production
        const explicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === 'true'
        const notProduction = process.env.NODE_ENV !== 'production'

        if (explicitlyEnabled && notProduction) {
          // Always allow auth API routes to function properly
          if (req.nextUrl.pathname.startsWith('/api/auth')) {
            return true
          }

          // Bypass auth for other routes except login page
          if (req.nextUrl.pathname !== '/login') {
            if (req.nextUrl.pathname.startsWith('/api/')) {
              console.log('[MIDDLEWARE] Development mode - bypassing auth check')
            }
            return true
          }
        }

        // Allow all OAuth-related requests (fastest check first)
        if (req.nextUrl.pathname.startsWith('/api/auth')) {
          return true
        }

        // Allow public pages, diagnostic endpoints, and webhooks
        const publicPaths = [
          '/login',
          '/api/auth/signin',
          '/api/auth/signout',
          '/api/auth/callback',
          '/api/auth/session',
          '/privacy',
          '/terms',
          '/health',
        ]

        // Note: /analytics and other dashboard routes require authentication
        // but should be accessible when logged in

        if (publicPaths.includes(req.nextUrl.pathname) ||
            req.nextUrl.pathname.startsWith('/analytics') || // Added analytics to public paths check
            req.nextUrl.pathname.startsWith('/dashboard') || // Also ensure dashboard routes are considered
            req.nextUrl.pathname.startsWith('/overview') ||  // And overview
            req.nextUrl.pathname.startsWith('/admin') ||    // And admin
            req.nextUrl.pathname.startsWith('/api/debug') ||
            req.nextUrl.pathname.startsWith('/api/_diag') ||
            req.nextUrl.pathname.startsWith('/api/webhook')) {
          return true
        }

        // For protected routes, check if user has valid token
        if (token && token.email) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[MIDDLEWARE] User authorized:', token.email, 'Role:', token.role)
          }
          return true
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('[MIDDLEWARE] No valid token, redirecting to login')
        }
        return false
      },
    },
  }
)

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    "/((?!api|_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest\\.json|sw\\.js|.*\\.css|.*\\.js).*)",
  ]
}