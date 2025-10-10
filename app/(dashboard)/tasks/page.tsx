import { getCurrentUser, assertRole } from '@/lib/auth'
import { prisma, withPrismaRetry } from '@/lib/prisma'
import { TasksClient } from './tasks-client'

export default async function TasksPage() {
  const user = await assertRole('LEVEL_2', 'LEVEL_3', 'ADMIN')

  // Additional null check for TypeScript safety
  if (!user || !user.id) {
    throw new Error('User authentication failed')
  }

  const tasks = await withPrismaRetry(async () => {
    return await prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
  })

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight neon-text">
          Mission Control
        </h1>
        <p className="text-base md:text-lg text-primary/80">
          Manage operations and track mission progress
        </p>
      </div>

      <TasksClient initialTasks={tasks} />
    </div>
  )
}