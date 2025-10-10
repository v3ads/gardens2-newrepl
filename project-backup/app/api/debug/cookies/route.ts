import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  
  const session = await getServerSession(authOptions)
  
  return NextResponse.json({
    cookies: allCookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' })),
    hasSession: !!session,
    sessionUser: session?.user?.email || null,
    nodeEnv: process.env.NODE_ENV,
    nextauthUrl: process.env.NEXTAUTH_URL
  })
}
