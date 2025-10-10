'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink, Bot, AlertCircle, CheckCircle } from 'lucide-react'

export default function JasminePage() {
  const [openStatus, setOpenStatus] = useState<'pending' | 'success' | 'blocked' | 'failed'>('pending')
  const [countdown, setCountdown] = useState(5)
  
  const jasmineChatGPTUrl = 'https://chatgpt.com/g/g-68626f1aa6f881919f1f6e7d95ba4cb4-jasmine-cynthia-gardens-rental-expert'

  const openJasmineAI = () => {
    try {
      // Try to open in new window/tab
      const newWindow = window.open(jasmineChatGPTUrl, '_blank', 'noopener,noreferrer')
      
      if (newWindow && !newWindow.closed) {
        setOpenStatus('success')
        // Start countdown to return to overview
        let count = 5
        setCountdown(count)
        const timer = setInterval(() => {
          count -= 1
          setCountdown(count)
          if (count <= 0) {
            clearInterval(timer)
            window.location.href = '/overview'
          }
        }, 1000)
      } else {
        // Popup was likely blocked
        setOpenStatus('blocked')
      }
    } catch (error) {
      console.error('Failed to open Jasmine AI:', error)
      setOpenStatus('failed')
    }
  }

  useEffect(() => {
    // Auto-open on page load with user-initiated fallback
    const timer = setTimeout(() => {
      openJasmineAI()
    }, 500) // Small delay to ensure page is loaded

    return () => clearTimeout(timer)
  }, [])

  const handleDirectOpen = () => {
    openJasmineAI()
  }

  const handleManualOpen = () => {
    // Fallback: direct navigation in same tab
    window.location.href = jasmineChatGPTUrl
  }

  return (
    <div className="container mx-auto p-6 h-full flex items-center justify-center">
      <Card className="futuristic-card max-w-lg">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <Bot className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold gradient-text">
            {openStatus === 'success' ? 'Jasmine AI Opened' : 'Opening Jasmine AI'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {openStatus === 'pending' && (
            <p className="text-muted-foreground">
              Opening Jasmine AI ChatGPT assistant for Cynthia Gardens operations...
            </p>
          )}
          
          {openStatus === 'success' && (
            <div className="space-y-2">
              <div className="flex items-center justify-center text-green-600">
                <CheckCircle className="h-5 w-5 mr-2" />
                <span>Successfully opened Jasmine AI!</span>
              </div>
              <p className="text-muted-foreground">
                Returning to Mission Control in {countdown} seconds...
              </p>
            </div>
          )}
          
          {openStatus === 'blocked' && (
            <div className="space-y-2">
              <div className="flex items-center justify-center text-yellow-600">
                <AlertCircle className="h-5 w-5 mr-2" />
                <span>Popup blocked by browser</span>
              </div>
              <p className="text-muted-foreground text-sm">
                Your browser blocked the popup. Please use the buttons below to open Jasmine AI.
              </p>
            </div>
          )}
          
          {openStatus === 'failed' && (
            <div className="space-y-2">
              <div className="flex items-center justify-center text-red-600">
                <AlertCircle className="h-5 w-5 mr-2" />
                <span>Failed to open automatically</span>
              </div>
              <p className="text-muted-foreground text-sm">
                Please use the buttons below to access Jasmine AI.
              </p>
            </div>
          )}
          
          {(openStatus === 'blocked' || openStatus === 'failed' || openStatus === 'pending') && (
            <div className="space-y-2">
              <Button
                onClick={handleDirectOpen}
                className="futuristic-button w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </Button>
              
              <Button
                onClick={handleManualOpen}
                variant="outline"
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Current Tab
              </Button>
            </div>
          )}
          
          <Button
            variant="outline"
            onClick={() => window.location.href = '/overview'}
            className="w-full"
          >
            Return to Mission Control
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}