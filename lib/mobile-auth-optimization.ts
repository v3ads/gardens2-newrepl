// Mobile-specific OAuth optimization utilities

export const mobileAuthConfig = {
  // Reduce initial load time by prefetching auth endpoints
  prefetchAuthEndpoints: () => {
    if (typeof window !== 'undefined') {
      // Prefetch OAuth endpoints for faster mobile authentication
      const endpoints = [
        '/api/auth/providers',
        '/api/auth/session',
        '/api/auth/csrf'
      ]
      
      endpoints.forEach(endpoint => {
        const link = document.createElement('link')
        link.rel = 'prefetch'
        link.href = endpoint
        document.head.appendChild(link)
      })
    }
  },

  // Optimize mobile viewport for OAuth popup
  setMobileViewport: () => {
    if (typeof window !== 'undefined') {
      const viewport = document.querySelector('meta[name=viewport]')
      if (viewport) {
        viewport.setAttribute(
          'content', 
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
        )
      }
    }
  },

  // Detect if user is on mobile for conditional optimizations
  isMobile: () => {
    if (typeof window === 'undefined') return false
    
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth <= 768
  },

  // Mobile-specific loading optimization
  optimizeForMobile: () => {
    if (mobileAuthConfig.isMobile()) {
      // Reduce animation delays on mobile
      document.documentElement.style.setProperty('--animation-duration', '150ms')
      
      // Add mobile-specific CSS optimizations
      const style = document.createElement('style')
      style.textContent = `
        @media (max-width: 768px) {
          .login-card {
            animation: none !important;
            transform: none !important;
          }
          
          button {
            -webkit-tap-highlight-color: rgba(0,0,0,0.1);
            touch-action: manipulation;
          }
        }
      `
      document.head.appendChild(style)
    }
  }
}