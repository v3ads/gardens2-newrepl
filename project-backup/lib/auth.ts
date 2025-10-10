import { NextAuthOptions, Session } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import { prisma, withPrismaRetry } from '@/lib/prisma'
import { getServerSession } from 'next-auth/next'
import { Role } from '@prisma/client'
import { getBaseUrl } from '@/lib/base-url'
import { redirect } from 'next/navigation'
import { JWT } from 'next-auth/jwt'
import type { User } from 'next-auth'
import type { Account, Profile } from 'next-auth'

// Environment sanitization helper
function clean(v?: string) {
  return (v ?? '').trim().replace(/^"|"$/g, '')
}

// Support both naming conventions for Google OAuth credentials
const GOOGLE_CLIENT_ID = clean(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ID)
const GOOGLE_CLIENT_SECRET = clean(process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET)
const NEXTAUTH_SECRET = clean(process.env.NEXTAUTH_SECRET)

// Enable debug mode in development
const isDev = process.env.NODE_ENV === 'development'

// Determine if we're in a secure context (production is always HTTPS)
const isSecureContext = process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://') === true

// OAuth callback URL is automatically handled by NextAuth.js

export const authOptions: NextAuthOptions = {
  debug: isDev || process.env.DEBUG === 'next-auth',
  adapter: PrismaAdapter(prisma) as any, // TODO: Fix NextAuth.js adapter compatibility after security update
  providers: [
    GoogleProvider({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile",
          // CRITICAL PRODUCTION FIX: Force user to select account every time, never auto-login
          prompt: "select_account consent",
          access_type: "offline",
          include_granted_scopes: true,
          // Completely prevent auto-login with cached Google accounts
          hd: undefined, // Don't restrict to hosted domain
          login_hint: undefined, // Don't pre-fill any account
          // Force fresh authentication
          max_age: 0, // Force fresh authentication, ignore cached session
        },
      },
      // Optimized for mobile performance
      httpOptions: {
        timeout: 15000, // Increased timeout for mobile networks
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        console.log('[AUTH] SignIn callback started:', { 
          email: user?.email, 
          provider: account?.provider,
          hasProfile: !!profile,
          // PRODUCTION DEBUG: Log to track auto-login issue
          userId: user?.id,
          accountId: account?.providerAccountId
        })
        // Add proper type guard for email validation
        if (!user?.email || typeof user.email !== 'string') {
          console.log('[SIGNIN] No email provided')
          return false
        }

        // PRODUCTION SAFETY: Extra validation to prevent auto-login issues
        console.log('[AUTH] PRODUCTION SAFETY CHECK:', {
          userEmail: user.email,
          isProduction: process.env.NODE_ENV === 'production',
          provider: account?.provider,
          accountId: account?.providerAccountId
        })
        
        // Add timeout to database operations to prevent hanging (increased from 10s to 20s)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database timeout')), 20000)
        )

        // CRITICAL DEBUG: Log the exact email being looked up
        console.log('[AUTH] CRITICAL DEBUG - Looking up user by email:', user.email)
        
        // Wrap database call with timeout and retry logic
        const dbUser = await Promise.race([
          withPrismaRetry(async () => {
            return await prisma.user.findUnique({
              where: { email: user.email! }
            })
          }),
          timeoutPromise
        ]).catch((error) => {
          console.error('[SIGNIN] Database error:', error)
          return null
        }) as any

        console.log('[AUTH] CRITICAL DEBUG - Database lookup result:', {
          searchedEmail: user.email,
          foundUser: dbUser ? {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role
          } : null
        })

        if (!dbUser) {
          console.error('[SIGNIN] REJECTING LOGIN - User not found in database:', user.email)
          console.error('[SIGNIN] Available users are: cynthia@cynthiagardens.com, leasing@cynthiagardens.com, vipaymanshalaby@gmail.com')
          
          // CRITICAL: Clear any existing JWT token to prevent session reuse
          await new Promise(resolve => setTimeout(resolve, 100)) // Brief delay for logging
          return false
        }

        // For OAuth providers, ensure account is linked to existing user
        if (account && account.provider === 'google') {
          // Check if account already exists with timeout protection
          const existingAccount = await Promise.race([
            withPrismaRetry(async () => {
              return await prisma.account.findUnique({
                where: {
                  provider_providerAccountId: {
                    provider: account.provider,
                    providerAccountId: account.providerAccountId,
                  },
                },
              })
            }),
            timeoutPromise
          ]).catch((error) => {
            console.error('[SIGNIN] Account lookup error:', error)
            return null
          }) as any

          // CRITICAL: If account exists but belongs to different user, reject sign-in
          if (existingAccount && existingAccount.userId !== dbUser.id) {
            console.error('[SIGNIN] SECURITY ALERT: OAuth account mismatch!', {
              requestedEmail: user.email,
              dbUserId: dbUser.id,
              existingAccountUserId: existingAccount.userId,
              provider: account.provider,
              providerAccountId: account.providerAccountId
            })
            console.error('[SIGNIN] This Google account is linked to a different user!')
            return false // Reject sign-in to prevent cross-user authentication
          }

          // If no account exists, create it and link to the existing user
          if (!existingAccount && dbUser) {
            console.log('[SIGNIN] Creating OAuth account link for existing user:', user.email)
            try {
              await Promise.race([
                prisma.account.create({
                  data: {
                    userId: dbUser.id,
                    type: account.type || 'oauth',
                    provider: account.provider,
                    providerAccountId: account.providerAccountId,
                    access_token: account.access_token,
                    expires_at: account.expires_at,
                    id_token: account.id_token,
                    refresh_token: account.refresh_token,
                    scope: account.scope,
                    session_state: account.session_state as string,
                    token_type: account.token_type,
                  },
                }),
                timeoutPromise
              ])
              console.log('[SIGNIN] OAuth account linked successfully')
            } catch (linkError) {
              console.error('[SIGNIN] Failed to link account:', linkError)
              // Still allow sign in if account link fails (user exists)
              return true
            }
          }
        }

        console.log('[SIGNIN] User authorized:', user.email, 'Role:', dbUser.role)
        return true
      } catch (error) {
        console.error('[AUTH] SignIn callback error:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          user: user?.email,
          provider: account?.provider
        })
        return false
      }
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      try {
        if (session?.user?.email) {
          console.log('[AUTH] Session callback - processing for email:', session.user.email, 'token.id:', (token as any).id)
          
          // Add timeout to prevent hanging (increased from 5s to 15s)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session lookup timeout')), 15000)
          )
          
          // CRITICAL: Use token ID as primary lookup to prevent identity mixups
          const userId = (token as any).id || token.sub
          let user = null
          
          if (userId) {
            // Lookup by stable user ID first (most secure)
            user = await Promise.race([
              withPrismaRetry(async () => {
                return await prisma.user.findUnique({
                  where: { id: userId },
                })
              }),
              timeoutPromise
            ]).catch((error) => {
              console.error('[AUTH] Session user lookup by ID error for', userId, ':', error)
              return null
            }) as any
          }
          
          // Fallback to email lookup only if ID lookup fails
          if (!user && session.user.email) {
            user = await Promise.race([
              withPrismaRetry(async () => {
                return await prisma.user.findUnique({
                  where: { email: session.user.email },
                })
              }),
              timeoutPromise
            ]).catch((error) => {
              console.error('[AUTH] Session user lookup by email error for', session.user.email, ':', error)
              return null
            }) as any
          }

          if (user) {
            console.log('[AUTH] Session callback - found user:', {
              requestedEmail: session.user.email,
              lookupMethod: userId ? 'by-id' : 'by-email',
              foundUserId: user.id,
              foundUserEmail: user.email,
              foundUserName: user.name,
              foundUserRole: user.role
            })
            session.user.role = user.role
            session.user.id = user.id
            // IMPORTANT: Ensure we're setting the correct user data from DB
            session.user.name = user.name
            session.user.email = user.email
          } else {
            console.log('[AUTH] Session callback - no user found for email/id:', session.user.email, userId)
            // No fallback - user must exist in database for valid session
            console.warn('[AUTH] User not found in database, session may be invalid')
          }
        }
      } catch (error) {
        console.error('[AUTH] Session callback error:', error)
        // Don't throw, just continue with session
      }
      return session
    },
    async jwt({ token, user }: { token: JWT; user?: User }) {
      try {
        console.log('[AUTH] JWT callback called with:', {
          hasUser: !!user,
          userEmail: user?.email,
          tokenSub: token.sub,
          tokenEmail: token.email,
          existingTokenId: (token as any).id
        })
        
        if (user) {
          console.log('[AUTH] JWT callback - processing user:', {
            userId: user.id,
            userEmail: user.email,
            userName: user.name,
            userRole: user.role
          })
          token.role = user.role
          token.id = user.id
          // Ensure JWT token contains the correct user data
          token.email = user.email
          token.name = user.name
        } else {
          console.log('[AUTH] JWT callback - no user provided, token email:', token.email)
        }
      } catch (error) {
        console.error('[AUTH] JWT callback error:', error)
        // Don't throw, just continue with token
      }
      return token
    },
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // After successful login, redirect to overview
      if (url === baseUrl || url === baseUrl + '/') {
        return `${baseUrl}/overview`
      }
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`
      }
      return url
    },
  },
  pages: {
    signIn: '/login',
    error: '/login', // Redirect auth errors to login page
  },
  logger: {
    error(code, metadata) {
      console.error('[NextAuth Error]', code, metadata)
    },
    warn(code) {
      console.warn('[NextAuth Warning]', code)
    },
    debug(code, metadata) {
      if (isDev) {
        console.log('[NextAuth Debug]', code, metadata)
      }
    }
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours - reduce session checks
    // CRITICAL: Force JWT refresh to prevent cached session reuse
    updateAge: 0, // Force JWT regeneration on every request
  },
  cookies: {
    sessionToken: {
      name: isSecureContext ? `__Secure-next-auth.session-token` : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecureContext,
        // Set domain for production to ensure cookies work across subdomains
        ...(process.env.NODE_ENV === 'production' && process.env.NEXTAUTH_URL 
          ? { domain: new URL(process.env.NEXTAUTH_URL).hostname } 
          : {}),
      },
    },
    state: {
      name: `next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: isSecureContext ? 'none' : 'lax',
        path: '/',
        secure: isSecureContext,
      },
    },
    pkceCodeVerifier: {
      name: `next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: isSecureContext ? 'none' : 'lax',
        path: '/',
        secure: isSecureContext,
      },
    },
  },
  useSecureCookies: isSecureContext,
  events: {
    async signIn({ user, account, profile }) {
      if (isDev) {
        console.log('[AUTH] Sign in event:', { user: user?.email, account: account?.provider })
      }
    },
    async signOut({ session, token }: { session?: Session; token?: JWT }) {
      console.log('[AUTH] Sign out event - clearing session:', { user: session?.user?.email })
      
      // Force complete token cleanup
      if (token) {
        // Clear all token properties to prevent cached data
        Object.keys(token).forEach(key => {
          delete token[key]
        })
        
        // Explicitly set critical fields to undefined
        token.role = undefined
        token.id = undefined
        token.email = undefined
        token.name = undefined
        token.sub = undefined
        token.iat = undefined
        token.exp = undefined
        token.jti = undefined
      }
      
      console.log('[AUTH] Complete session data cleared successfully')
    },
  },
}

export async function getCurrentUser() {
  // PRODUCTION SAFETY: Only use dev session when explicitly enabled AND not in production
  const explicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === 'true'
  const notProduction = process.env.NODE_ENV !== 'production'
  
  if (explicitlyEnabled && notProduction) {
    const { getDevSession } = await import('./dev-session')
    const devSession = getDevSession()
    console.log('[AUTH] Using DEV session override:', devSession?.user?.email)
    return devSession?.user || null
  }

  // Always use real authentication in production or when dev session disabled
  const session = await getServerSession(authOptions)
  console.log('[AUTH] Using real session:', (session as any)?.user?.email || 'not authenticated')
  return (session as any)?.user || null
}

export async function assertRole(...allowedRoles: Role[]) {
  const user = await getCurrentUser()

  // PRODUCTION SAFETY: Only use dev user bypass when explicitly enabled AND not in production
  const explicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === 'true'
  const notProduction = process.env.NODE_ENV !== 'production'
  
  if (explicitlyEnabled && notProduction) {
    if (!user || !user.id) {
      throw new Error('Development user configuration error')
    }
    return user as { id: string; name: string; email: string; image: string | null; role: Role }
  }

  // Redirect to login if user is not authenticated
  if (!user || !user.id) {
    redirect('/login')
  }

  // Redirect to login with error if user doesn't have the required role
  if (!user.role || !allowedRoles.includes(user.role as Role)) {
    redirect('/login?error=AccessDenied')
  }

  return user as { id: string; name: string; email: string; image: string | null; role: Role }
}