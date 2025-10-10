import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// DEPRECATED: Legacy SQLite analytics checking route - disabled for PostgreSQL architecture
export async function GET(request: NextRequest) {
  return NextResponse.json({
    error: 'Legacy route disabled',
    message: 'This SQLite-based analytics checking route is no longer supported in the PostgreSQL architecture'
  }, { status: 410 })
}