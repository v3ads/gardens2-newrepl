import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma, withPrismaRetry } from '@/lib/prisma'
import { z } from 'zod'

const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    
    if (!user || !user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title } = createTaskSchema.parse(body)

    const task = await withPrismaRetry(async () => {
      return await prisma.task.create({
        data: {
          title,
          userId: user.id,
        },
      })
    })

    return NextResponse.json(task)
  } catch (error) {
    console.error('Create task error:', error)
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || !user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tasks = await withPrismaRetry(async () => {
      return await prisma.task.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      })
    })

    return NextResponse.json(tasks)
  } catch (error) {
    console.error('Get tasks error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}