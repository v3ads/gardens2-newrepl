import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const FEATURE_ORDER_FILE = join(process.cwd(), '.feature-order.json')
const DEFAULT_ORDER = ['overview', 'tasks', 'jasmine', 'analytics', 'user_management']

// Load feature order from file or use default
function loadFeatureOrder(): string[] {
  try {
    if (existsSync(FEATURE_ORDER_FILE)) {
      const data = readFileSync(FEATURE_ORDER_FILE, 'utf8')
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : DEFAULT_ORDER
    }
  } catch (error) {
    console.warn('Failed to load feature order, using default:', error)
  }
  return [...DEFAULT_ORDER]
}

// Save feature order to file
function saveFeatureOrder(order: string[]): void {
  try {
    writeFileSync(FEATURE_ORDER_FILE, JSON.stringify(order, null, 2))
  } catch (error) {
    console.warn('Failed to save feature order:', error)
  }
}

let featureOrder: string[] = loadFeatureOrder()

export function getFeatureOrder(): string[] {
  return [...featureOrder]
}

export function setFeatureOrder(newOrder: string[]): void {
  featureOrder = [...newOrder]
  saveFeatureOrder(featureOrder)
}

export function moveFeature(featureKey: string, direction: 'up' | 'down'): string[] {
  const currentOrder = [...featureOrder]
  const currentIndex = currentOrder.indexOf(featureKey)
  
  if (currentIndex === -1) return currentOrder
  
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  
  if (targetIndex < 0 || targetIndex >= currentOrder.length) {
    return currentOrder
  }
  
  // Swap the features
  [currentOrder[currentIndex], currentOrder[targetIndex]] = 
  [currentOrder[targetIndex], currentOrder[currentIndex]]
  
  featureOrder = currentOrder
  saveFeatureOrder(featureOrder)
  return currentOrder
}