'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from '@/hooks/use-session-override'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FEATURES, FeatureDef } from '@/lib/features'
import { PWAInstallButton, PWAStatus } from '@/components/pwa-install-button'
import { Search, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import {
  CSS,
} from '@dnd-kit/utilities'

interface SidebarProps {
  className?: string
  onNavigate?: () => void
}

// Sortable menu item component
function SortableMenuItem({ feature, pathname, onNavigate }: { feature: FeatureDef; pathname: string; onNavigate?: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feature.key })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <Button
        variant={pathname === feature.path ? 'secondary' : 'ghost'}
        className={cn(
          "w-full justify-start text-left transition-all duration-300 hover:bg-primary/20 hover:border-primary/50 hover:text-primary border border-transparent hover:shadow-lg",
          pathname === feature.path && "futuristic-button-primary text-primary-foreground"
        )}
        asChild
      >
        <Link 
          href={feature.path} 
          className="flex items-center p-3 rounded-lg pr-10"
          onClick={onNavigate}
        >
          <span className="flex-shrink-0 text-primary">{feature.icon}</span>
          <span className="ml-3 truncate">{feature.name}</span>
          {pathname === feature.path && (
            <div className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse"></div>
          )}
        </Link>
      </Button>
      <div 
        {...attributes} 
        {...listeners}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 touch-manipulation cursor-grab active:cursor-grabbing text-primary/60 hover:text-primary transition-opacity"
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="h-4 w-4" />
      </div>
    </div>
  )
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [searchTerm, setSearchTerm] = useState('')
  const [accessibleFeatures, setAccessibleFeatures] = useState<string[]>([])
  const [customOrder, setCustomOrder] = useState<string[]>([])
  const [isReordering, setIsReordering] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Load custom order from database (admin only)
  const loadCustomOrder = async () => {
    if (!session?.user?.id || session.user.role !== 'ADMIN') return
    
    try {
      const response = await fetch('/api/user/preferences/navigation')
      if (response.ok) {
        const data = await response.json()
        setCustomOrder(data.navigationOrder || [])
      }
    } catch (err) {
      console.warn('Failed to load saved menu order:', err)
    }
  }

  // Save custom order to database (admin only)
  const saveCustomOrder = async (order: string[]) => {
    if (!session?.user?.id || session.user.role !== 'ADMIN') return
    
    setCustomOrder(order)
    
    try {
      await fetch('/api/user/preferences/navigation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ navigationOrder: order })
      })
    } catch (err) {
      console.warn('Failed to save menu order:', err)
    }
  }

  // Function to refresh features with improved error handling
  const refreshFeatures = async () => {
    if (session?.user?.role) {
      const maxRetries = 3
      let retryCount = 0
      
      const attemptFetch = async (): Promise<void> => {
        try {
          const timestamp = Date.now()
          console.log('Fetching features for role:', session.user.role, 'at', timestamp)
          const response = await fetch(`/api/features/accessible?role=${session.user.role}&t=${timestamp}`)
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          const data = await response.json()
          console.log('Features loaded successfully:', data.features)
          setAccessibleFeatures(data.features || [])
        } catch (err) {
          console.error(`Failed to fetch features (attempt ${retryCount + 1}):`, err)
          
          if (retryCount < maxRetries - 1) {
            retryCount++
            const delay = 500 * Math.pow(2, retryCount - 1)
            console.log(`Retrying in ${delay}ms...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            return attemptFetch()
          } else {
            console.error('Max retries reached, using empty features')
            setAccessibleFeatures([])
          }
        }
      }

      await attemptFetch()
    }
  }

  useEffect(() => {
    refreshFeatures()
    if (session?.user?.id && session.user.role === 'ADMIN') {
      loadCustomOrder()
    }
  }, [session?.user?.role, session?.user?.id])

  // Additional effect to handle session loading states
  useEffect(() => {
    // If session is available but no features loaded, retry
    if (session?.user?.role && accessibleFeatures.length === 0) {
      const retryTimer = setTimeout(() => {
        console.log('Session ready but no features loaded, retrying...')
        refreshFeatures()
      }, 1000)
      
      return () => clearTimeout(retryTimer)
    }
  }, [session?.user?.role, accessibleFeatures.length])

  // Listen for custom events to refresh when features are updated
  useEffect(() => {
    const handleFeaturesUpdate = () => {
      refreshFeatures()
    }

    window.addEventListener('featuresUpdated', handleFeaturesUpdate)
    return () => window.removeEventListener('featuresUpdated', handleFeaturesUpdate)
  }, [session?.user?.role])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = orderedFeatures.findIndex(f => f.key === active.id)
      const newIndex = orderedFeatures.findIndex(f => f.key === over.id)
      
      const newOrder = arrayMove(orderedFeatures, oldIndex, newIndex).map(f => f.key)
      saveCustomOrder(newOrder)
    }
    
    setIsReordering(false)
  }

  const handleDragStart = () => {
    setIsReordering(true)
  }

  // Memoize ordered features for performance
  const orderedFeatures = useMemo(() => {
    // Get available features
    const availableFeatures = accessibleFeatures
      .map(featureKey => FEATURES.find(f => f.key === featureKey))
      .filter((feature): feature is FeatureDef => feature !== undefined)
    
    // Apply custom order if exists
    if (customOrder.length > 0) {
      const ordered: FeatureDef[] = []
      const remaining = [...availableFeatures]
      
      // Add features in custom order
      customOrder.forEach(key => {
        const index = remaining.findIndex(f => f.key === key)
        if (index >= 0) {
          ordered.push(remaining[index])
          remaining.splice(index, 1)
        }
      })
      
      // Add any remaining features at the end
      ordered.push(...remaining)
      return ordered
    }
    
    return availableFeatures
  }, [accessibleFeatures, customOrder])

  // Memoize filtered features for performance
  const filteredFeatures = useMemo(() => {
    // Filter by search term
    return orderedFeatures.filter(feature => {
      const matchesSearch = feature.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           feature.description.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesSearch
    })
  }, [orderedFeatures, searchTerm])

  return (
    <div className={cn('pb-12 w-64 max-w-full futuristic-sidebar', className)}>
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-primary/60" />
            <Input
              placeholder="Search features..."
              className="pl-10 w-full futuristic-input border-primary/40 focus:border-primary"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="px-3 group">
          <div className="flex items-center justify-between mb-4 px-4">
            <h2 className="text-lg font-semibold tracking-tight neon-text">
              Features
            </h2>
            {session?.user?.role === 'ADMIN' && (
              <div className="text-xs text-primary/60 opacity-0 group-hover:opacity-100 transition-opacity">
                Drag to reorder
              </div>
            )}
          </div>
          {session?.user?.role === 'ADMIN' ? (
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              onDragStart={handleDragStart}
            >
              <SortableContext items={filteredFeatures.map(f => f.key)} strategy={verticalListSortingStrategy}>
                <div className={cn(
                  "space-y-2 transition-all duration-200",
                  isReordering && "select-none"
                )}>
                  {filteredFeatures.length === 0 && session?.user?.role ? (
                    <div className="space-y-2">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex items-center p-3 rounded-lg border border-primary/20 animate-pulse">
                          <div className="w-5 h-5 bg-primary/20 rounded mr-3"></div>
                          <div className="flex-1 h-4 bg-primary/20 rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    filteredFeatures.map((feature) => (
                      <SortableMenuItem
                        key={feature.key}
                        feature={feature}
                        pathname={pathname}
                        onNavigate={onNavigate}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="space-y-2">
              {filteredFeatures.length === 0 && session?.user?.role ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center p-3 rounded-lg border border-primary/20 animate-pulse">
                      <div className="w-5 h-5 bg-primary/20 rounded mr-3"></div>
                      <div className="flex-1 h-4 bg-primary/20 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : (
                filteredFeatures.map((feature) => (
                  <Button
                    key={feature.key}
                    variant={pathname === feature.path ? 'secondary' : 'ghost'}
                    className={cn(
                      "w-full justify-start text-left transition-all duration-300 hover:bg-primary/20 hover:border-primary/50 hover:text-primary border border-transparent hover:shadow-lg",
                      pathname === feature.path && "futuristic-button-primary text-primary-foreground"
                    )}
                    asChild
                  >
                    <Link 
                      href={feature.path} 
                      className="flex items-center p-3 rounded-lg"
                      onClick={onNavigate}
                    >
                      <span className="flex-shrink-0 text-primary">{feature.icon}</span>
                      <span className="ml-3 truncate">{feature.name}</span>
                      {pathname === feature.path && (
                        <div className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                      )}
                    </Link>
                  </Button>
                ))
              )}
            </div>
          )}
          
          {/* PWA Install Section */}
          <div className="mt-6 px-4 space-y-2">
            <PWAStatus />
            <PWAInstallButton />
          </div>
        </div>
      </div>
    </div>
  )
}