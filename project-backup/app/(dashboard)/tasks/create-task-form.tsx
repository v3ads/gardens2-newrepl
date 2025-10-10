'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Task } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(255, 'Title too long'),
})

type CreateTaskData = z.infer<typeof createTaskSchema>

interface CreateTaskFormProps {
  onTaskCreated?: (task: Task) => void
}

export function CreateTaskForm({ onTaskCreated }: CreateTaskFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTaskData>({
    resolver: zodResolver(createTaskSchema),
  })

  const onSubmit = async (data: CreateTaskData) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        const newTask = await response.json()
        reset()
        toast.success('Mission initialized successfully', { duration: 3000 })
        // Ensure callback is called immediately for real-time updates
        if (onTaskCreated) {
          onTaskCreated(newTask)
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create task' }))
        toast.error(errorData.error || 'Failed to initialize mission')
      }
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('Error initializing mission')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-primary flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/20 border border-primary/40">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          Initialize New Mission
        </h2>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="title" className="text-sm font-medium text-primary">Mission Directive</Label>
          <Input
              id="title"
              placeholder="Enter mission parameters..."
              {...register('title')}
              disabled={isLoading}
              className="w-full futuristic-input"
            />
            {errors.title && (
              <p className="text-sm text-destructive flex items-center gap-2">
                <div className="w-1 h-1 bg-destructive rounded-full animate-pulse"></div>
                {errors.title.message}
              </p>
            )}
        </div>
        <Button 
          type="submit" 
          disabled={isLoading} 
          className="w-full futuristic-button-primary text-primary-foreground font-semibold py-3"
        >
          {isLoading ? 'Initializing Mission...' : 'Deploy Mission'}
        </Button>
      </form>
    </div>
  )
}