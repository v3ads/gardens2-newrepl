import { ReactNode, createElement } from 'react'
import { LayoutDashboard, CheckSquare, Calendar, BarChart2, Users, MessageCircle, DollarSign, BarChart3 } from 'lucide-react'

export type FeatureKey = 'overview' | 'tasks' | 'jasmine' | 'user_management' | 'analytics' | 'rentiq'

export interface FeatureDef {
  key: FeatureKey
  name: string
  description: string
  icon: ReactNode
  path: string
  enabledByDefault: boolean
}

export const FEATURES: FeatureDef[] = [
  {
    key: 'overview',
    name: 'Overview',
    description: 'Dashboard overview and activity summary',
    icon: createElement(LayoutDashboard, { className: 'h-5 w-5' }),
    path: '/overview',
    enabledByDefault: true,
  },
  {
    key: 'tasks',
    name: 'Tasks',
    description: 'Personal task management and tracking',
    icon: createElement(CheckSquare, { className: 'h-5 w-5' }),
    path: '/tasks',
    enabledByDefault: true,
  },
  {
    key: 'jasmine',
    name: 'Jasmine',
    description: 'AI Assistant Chatbot',
    icon: createElement(MessageCircle, { className: 'h-5 w-5' }),
    path: '/jasmine',
    enabledByDefault: true,
  },
  {
    key: 'analytics',
    name: 'Analytics',
    description: 'Property management analytics and insights',
    icon: createElement(BarChart2, { className: 'h-5 w-5' }),
    path: '/analytics',
    enabledByDefault: true,
  },
  {
    key: 'rentiq',
    name: 'RentIQ',
    description: 'Smart pricing engine to close occupancy gaps and reach 95% occupancy using daily unit data from master.csv.',
    icon: createElement(DollarSign, { className: 'h-5 w-5' }),
    path: '/rentiq',
    enabledByDefault: true,
  },
  {
    key: 'user_management',
    name: 'User Management',
    description: 'Manage user accounts and access levels',
    icon: createElement(Users, { className: 'h-5 w-5' }),
    path: '/admin/users',
    enabledByDefault: false,
  },
]