'use client'

import { useState, useCallback, useEffect, useTransition } from 'react'
import { Task } from '@prisma/client'
import { TaskList } from './task-list'
import { CreateTaskForm } from './create-task-form'

interface TasksClientProps {
  initialTasks: Task[]
}

export function TasksClient({ initialTasks }: TasksClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [isPending, startTransition] = useTransition()

  // Optimistic update with immediate UI feedback
  const addTask = useCallback((newTask: Task) => {
    startTransition(() => {
      setTasks(prev => [newTask, ...prev])
    })
  }, [])

  // Optimistic update that returns undo function
  const updateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    // Capture previous state before any updates
    const previousTasks = tasks
    
    // Apply optimistic update immediately
    startTransition(() => {
      setTasks(prev => prev.map(task =>
        task.id === taskId ? { ...task, ...updates } : task
      ))
    })

    // Return undo function that restores original state
    return () => {
      startTransition(() => {
        setTasks(previousTasks)
      })
    }
  }, [tasks])

  // Optimistic remove that returns undo function
  const removeTask = useCallback((taskId: string) => {
    // Capture previous state before any updates
    const previousTasks = tasks
    
    // Apply optimistic update immediately
    startTransition(() => {
      setTasks(prev => prev.filter(task => task.id !== taskId))
    })

    // Return undo function that restores original state
    return () => {
      startTransition(() => {
        setTasks(previousTasks)
      })
    }
  }, [tasks])

  return (
    <div className={`transition-opacity duration-200 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
      <div className="futuristic-card">
        <CreateTaskForm onTaskCreated={addTask} />
      </div>
      <div className="futuristic-card">
        <TaskList 
          tasks={tasks} 
          onTaskUpdate={updateTask}
          onTaskDelete={removeTask}
        />
      </div>
    </div>
  )
}