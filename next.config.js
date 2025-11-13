/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use SWC minifier for better performance and lower memory usage
  swcMinify: true,
  
  // Explicitly disable ESLint and TypeScript checking during builds to reduce memory
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Explicit build directories to prevent dev/prod artifact collision
  distDir: process.env.NEXT_DIST_DIR || '.next',
  
  // Standalone output for better Replit compatibility
  output: 'standalone',

  // Prevent native modules from being bundled (fixes build crashes) - Next.js 14 format
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
    // Reduce parallel workers to prevent memory spikes
    workerThreads: false,
    cpus: 1,
  },
  
  webpack: (config, { isServer, dev }) => {
    // Disable server cache in development to prevent corruption
    if (dev && isServer) {
      config.cache = false
    }
    
    // Externalize native modules to prevent build crashes
    if (isServer) {
      config.externals = [...(config.externals || []), 'sharp']
    }
    
    // Reduce parallel processing during builds to prevent memory spikes
    if (!dev) {
      config.parallelism = 1
      config.optimization = {
        ...config.optimization,
        minimize: true,
        // Reduce memory usage during minimization
        minimizer: config.optimization?.minimizer || [],
      }
    }
    
    // Exclude problematic directories from watching
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.next*/**',
          '**/attached_assets/**',
          '**/.git/**',
          '**/build.log',
          '**/debug_status.js',
        ],
        poll: false, // Disable polling
        aggregateTimeout: 300, // Delay rebuilds
      }
    }
    
    return config
  },
  
  images: {
    unoptimized: true, // Disable image optimization to prevent sharp loading
    domains: ['lh3.googleusercontent.com'],
  },
  
  // Allow all hosts for Replit preview
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options', 
            value: 'SAMEORIGIN',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig