'use client'

import { signIn, getSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Chrome } from 'lucide-react'
import { mobileAuthConfig } from '@/lib/mobile-auth-optimization'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Apply mobile optimizations immediately
    mobileAuthConfig.prefetchAuthEndpoints()
    mobileAuthConfig.setMobileViewport()
    mobileAuthConfig.optimizeForMobile()
    
    // Optimize session check for mobile by reducing initial load
    const checkSession = async () => {
      const session = await getSession()
      if (session) {
        router.push('/overview')
      }
    }
    
    // Add small delay to prevent flash of login page
    const timer = setTimeout(checkSession, 100)
    return () => clearTimeout(timer)
  }, [router])

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      // Optimize for mobile with redirect instead of popup
      await signIn('google', { 
        callbackUrl: '/overview',
        redirect: true // Force redirect for better mobile compatibility
      })
    } catch (error) {
      console.error('Sign in failed:', error)
      setIsLoading(false) // Only reset loading on error
    }
    // Don't reset loading on success since we're redirecting
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[400px] login-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your Cynthia Gardens Command Center
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={true}
            >
              <Chrome className="mr-2 h-4 w-4" />
              Signing in...
            </Button>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex justify-center items-center p-0 border-none bg-transparent hover:opacity-80 transition-opacity touch-manipulation"
              disabled={isLoading}
              style={{
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none'
              }}
            >
              <img
                src="https://developers.google.com/static/identity/images/branding_guideline_sample_lt_sq_lg.svg"
                alt="Sign in with Google"
                className="w-full max-w-[240px] h-auto"
                loading="eager"
                decoding="sync"
              />
            </button>
          )}
          
          <div className="text-center text-sm text-muted-foreground">
            <p>Only authorized users may access this system.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}