'use client'

import { useState } from 'react'
import { Feature, RoleFeature, Role } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { FEATURES } from '@/lib/features'

interface FeatureWithRoles extends Feature {
  roleFeatures: RoleFeature[]
}

interface FeatureManagementProps {
  features: FeatureWithRoles[]
}

export function FeatureManagement({ features: initialFeatures }: FeatureManagementProps) {
  const [features, setFeatures] = useState(initialFeatures)
  const [isLoading, setIsLoading] = useState(false)

  const roles: Role[] = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3']

  const updateFeatureEnabled = async (featureId: string, enabled: boolean) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/features', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId, enabled }),
      })

      if (response.ok) {
        setFeatures(prev =>
          prev.map(feature =>
            feature.id === featureId ? { ...feature, enabled } : feature
          )
        )
        // Trigger sidebar refresh
        window.dispatchEvent(new CustomEvent('features-updated'))
      }
    } catch (error) {
      console.error('Failed to update feature:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateRoleAccess = async (featureId: string, role: Role, hasAccess: boolean) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/features/role-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId, role, hasAccess }),
      })

      if (response.ok) {
        setFeatures(prev =>
          prev.map(feature => {
            if (feature.id === featureId) {
              const updatedRoleFeatures = feature.roleFeatures.map(rf =>
                rf.role === role ? { ...rf, hasAccess } : rf
              )
              
              // Add new role feature if it doesn't exist
              if (!updatedRoleFeatures.find(rf => rf.role === role)) {
                updatedRoleFeatures.push({
                  id: `temp-${Date.now()}`,
                  role,
                  featureId,
                  hasAccess,
                })
              }
              
              return { ...feature, roleFeatures: updatedRoleFeatures }
            }
            return feature
          })
        )
        // Trigger sidebar refresh
        window.dispatchEvent(new CustomEvent('features-updated'))
      }
    } catch (error) {
      console.error('Failed to update role access:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const moveFeature = async (featureId: string, direction: 'up' | 'down') => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/features/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId, direction }),
      })

      if (response.ok) {
        // Optimistically update the local state
        setFeatures(prev => {
          const featureIndex = prev.findIndex(f => f.id === featureId)
          if (featureIndex === -1) return prev
          
          const newFeatures = [...prev]
          const targetIndex = direction === 'up' ? featureIndex - 1 : featureIndex + 1
          
          if (targetIndex >= 0 && targetIndex < newFeatures.length) {
            // Swap the features
            [newFeatures[featureIndex], newFeatures[targetIndex]] = 
            [newFeatures[targetIndex], newFeatures[featureIndex]]
          }
          
          return newFeatures
        })
        
        // Trigger sidebar refresh
        window.dispatchEvent(new CustomEvent('features-updated'))
        
      }
    } catch (error) {
      console.error('Failed to reorder feature:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getRoleAccess = (feature: FeatureWithRoles, role: Role): boolean => {
    const roleFeature = feature.roleFeatures.find(rf => rf.role === role)
    return roleFeature?.hasAccess || false
  }

  const getFeatureIcon = (featureKey: string) => {
    const featureDef = FEATURES.find(f => f.key === featureKey)
    return featureDef?.icon
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Access Matrix</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-4 p-4 border-b font-medium">
            <div>Order</div>
            <div>Feature</div>
            <div>Enabled</div>
            <div>LEVEL_1</div>
            <div>LEVEL_2</div>
            <div>LEVEL_3</div>
          </div>

          {features.map((feature, index) => (
            <div key={feature.id} className="grid grid-cols-6 gap-4 p-4 border rounded-lg">
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveFeature(feature.id, 'up')}
                  disabled={isLoading || index === 0}
                  className="h-6 w-6 p-0"
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveFeature(feature.id, 'down')}
                  disabled={isLoading || index === features.length - 1}
                  className="h-6 w-6 p-0"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
              
              <div className="flex items-center space-x-2">
                {getFeatureIcon(feature.key)}
                <div>
                  <div className="font-medium">{feature.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {feature.description}
                  </div>
                </div>
              </div>

              <div>
                <Switch
                  checked={feature.enabled}
                  onCheckedChange={(enabled) =>
                    updateFeatureEnabled(feature.id, enabled)
                  }
                  disabled={isLoading}
                />
              </div>

              {roles.map((role) => (
                <div key={role}>
                  <Checkbox
                    checked={getRoleAccess(feature, role)}
                    onCheckedChange={(hasAccess) =>
                      updateRoleAccess(feature.id, role, hasAccess as boolean)
                    }
                    disabled={isLoading || !feature.enabled}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}