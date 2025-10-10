'use client'

import { Task } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface TaskListProps {
  tasks: Task[]
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => (() => void) | void
  onTaskDelete?: (taskId: string) => (() => void) | void
}

export function TaskList({ tasks, onTaskUpdate, onTaskDelete }: TaskListProps) {
  const toggleTask = async (taskId: string, done: boolean) => {
    // Apply optimistic update and get undo function
    const undo = onTaskUpdate?.(taskId, { done })
    
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      })

      if (response.ok) {
        toast.success(done ? 'Mission completed' : 'Mission reactivated', { duration: 3000 })
      } else {
        // API call failed - rollback the optimistic update
        undo?.()
        toast.error('Failed to update mission status - changes reverted')
      }
    } catch (error) {
      console.error('Failed to update task:', error)
      // API call failed - rollback the optimistic update  
      undo?.()
      toast.error('Error updating mission status - changes reverted')
    }
  }

  const deleteTask = async (taskId: string) => {
    // Apply optimistic update and get undo function
    const undo = onTaskDelete?.(taskId)
    
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Mission terminated', { duration: 3000 })
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Delete failed:', response.status, errorData)
        // API call failed - rollback the optimistic update
        undo?.()
        toast.error('Failed to terminate mission - task restored')
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
      // API call failed - rollback the optimistic update
      undo?.()
      toast.error('Error terminating mission - task restored')
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary/40 rounded-full animate-pulse"></div>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-primary">Mission Queue Empty</h3>
            <p className="text-primary/70">
              No active missions detected. Initialize your first operation above.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-primary flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/20 border border-primary/40">
            <div className="w-5 h-5 bg-primary rounded-sm"></div>
          </div>
          Active Missions ({tasks.length})
        </h2>
      </div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`p-4 rounded-lg border transition-all duration-300 hover:scale-[1.02] ${
              task.done 
                ? 'bg-green-500/10 border-green-500/30 shadow-sm' 
                : 'bg-primary/5 border-primary/20 hover:border-primary/40 hover:bg-primary/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Checkbox
                  checked={task.done}
                  onCheckedChange={(checked) => toggleTask(task.id, checked as boolean)}
                  className="border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <div className="flex flex-col">
                  <span className={`font-medium transition-all duration-300 ${
                    task.done 
                      ? 'line-through text-green-500/80' 
                      : 'text-primary'
                  }`}>
                    {task.title}
                  </span>
                  <span className="text-xs text-primary/60">
                    {task.done ? 'Mission Complete' : 'Status: Active'}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteTask(task.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/30 transition-all duration-300"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          ))}
      </div>
    </div>
  )
}