import { NextResponse } from 'next/server'

// DEPRECATED: Legacy SQLite migration route - disabled for PostgreSQL architecture
export async function POST() {
  return NextResponse.json({
    error: 'Legacy migration route disabled',
    message: 'This SQLite-based migration is no longer supported in the PostgreSQL architecture'
  }, { status: 410 })
}