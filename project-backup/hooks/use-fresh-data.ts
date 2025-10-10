import { useCallback } from 'react'

/**
 * Custom hook for ensuring fresh data with aggressive cache busting
 * Automatically appends timestamp and cache-busting headers to fetch requests
 */
export function useFreshData() {
  const fetchWithCacheBusting = useCallback(async (url: string, options: RequestInit = {}) => {
    // Add timestamp parameter for cache busting
    const timestamp = Date.now()
    const separator = url.includes('?') ? '&' : '?'
    const urlWithTimestamp = `${url}${separator}t=${timestamp}`
    
    // Merge aggressive cache-busting headers
    const freshHeaders = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...options.headers
    }
    
    return fetch(urlWithTimestamp, {
      ...options,
      cache: 'no-store',
      headers: freshHeaders
    })
  }, [])

  const createAutoRefresh = useCallback((
    refreshFn: () => void | Promise<void>, 
    intervalMs: number = 5 * 60 * 1000 // Default 5 minutes
  ) => {
    const interval = setInterval(() => {
      refreshFn()
    }, intervalMs)
    
    return () => clearInterval(interval)
  }, [])

  return {
    fetchWithCacheBusting,
    createAutoRefresh
  }
}