'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Building2, DollarSign, Wrench, LineChart } from 'lucide-react'
import { useAnalytics } from '@/contexts/analytics-context'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

const analyticsCategories = [
  {
    key: 'occupancy',
    title: 'Occupancy & Leasing',
    description: 'Rates, vacancy days, move‑ins/outs, expirations, renewals.',
    icon: Building2,
  },
  {
    key: 'financial',
    title: 'Financial',
    description: 'MRR, MoM growth, ARPU, vacancy loss, collections.',
    icon: DollarSign,
  },
  {
    key: 'operations',
    title: 'Operational Efficiency',
    description: 'Turnover %, make‑ready cycle, maintenance‑linked vacancy.',
    icon: Wrench,
  },
  {
    key: 'forecasts',
    title: 'Forecasts & Insights',
    description: 'Occupancy & MRR projections, seasonality, churn risk.',
    icon: LineChart,
  },
]

export default function AnalyticsPage() {
  const router = useRouter()
  const { setSelectedCategory } = useAnalytics()

  const handleCategorySelect = (categoryKey: string) => {
    setSelectedCategory(categoryKey)
    router.push(`/analytics/${categoryKey}`)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-muted-foreground">
          Comprehensive insights into property management performance and metrics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {analyticsCategories.map((category) => {
          const IconComponent = category.icon
          return (
            <Card
              key={category.key}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 hover:border-primary/50"
              onClick={() => handleCategorySelect(category.key)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <IconComponent className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{category.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {category.description}
                </CardDescription>
              </CardContent>
            </Card>
          )
        })}
      </div>

    </div>
  )
}