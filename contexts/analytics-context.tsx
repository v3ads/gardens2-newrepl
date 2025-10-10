'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface AnalyticsContextType {
  selectedCategory: string | null
  setSelectedCategory: (category: string | null) => void
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined)

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  return (
    <AnalyticsContext.Provider value={{ selectedCategory, setSelectedCategory }}>
      {children}
    </AnalyticsContext.Provider>
  )
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext)
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider')
  }
  return context
}