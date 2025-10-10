import { NextResponse } from 'next/server'
import { setStudentOverride, removeStudentOverride } from '@/lib/student-overrides'
import { buildUnitsLeasingMaster } from '@/lib/occupancy-analytics'
import { requireAdminAuth } from '@/lib/auth-middleware'

export async function POST(request: Request) {
  // Require admin authentication
  const authResult = await requireAdminAuth(request as any)
  if (!authResult.authorized) {
    return authResult.response!
  }
  
  try {
    const { unit_code, is_student } = await request.json()

    if (!unit_code || typeof is_student !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'unit_code and is_student (boolean) are required'
      }, { status: 400 })
    }

    // Set the override
    setStudentOverride(unit_code, is_student)

    // Rebuild analytics to reflect the change
    const today = new Date().toISOString().split('T')[0]
    await buildUnitsLeasingMaster(today)

    return NextResponse.json({
      success: true,
      message: `Override set: ${unit_code} -> ${is_student ? 'student' : 'non-student'}`
    })

  } catch (error) {
    console.error('[STUDENT_OVERRIDE] Error setting override:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to set student override',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  // Require admin authentication
  const authResult = await requireAdminAuth(request as any)
  if (!authResult.authorized) {
    return authResult.response!
  }
  
  try {
    const { unit_code } = await request.json()

    if (!unit_code) {
      return NextResponse.json({
        success: false,
        error: 'unit_code is required'
      }, { status: 400 })
    }

    // Remove the override
    removeStudentOverride(unit_code)

    // Rebuild analytics to reflect the change
    const today = new Date().toISOString().split('T')[0]
    await buildUnitsLeasingMaster(today)

    return NextResponse.json({
      success: true,
      message: `Override removed for: ${unit_code}`
    })

  } catch (error) {
    console.error('[STUDENT_OVERRIDE] Error removing override:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to remove student override',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}