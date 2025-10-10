#!/bin/bash
# Standard production startup script

set -e

# Ensure we're in the correct directory
cd /home/runner/workspace || exit 1

echo "🚀 Starting Cynthia Gardens Command Center (Production Mode)"
echo "📊 Environment: production"
echo "📍 Working directory: $(pwd)"
echo "🕐 Started at: $(date)"

# Production logs to stdout (captured by Replit Publishing)
# No need to create log files - Replit handles this automatically

# Run database migrations
echo "🔄 Running Prisma migrations..."
if npx prisma migrate deploy; then
    echo "✅ Database migrations completed successfully"
else
    echo "❌ Database migration failed - exiting to prevent data issues"
    exit 1
fi

# Generate Prisma client (safety measure)
echo "🔧 Ensuring Prisma client is generated..."
if npx prisma generate; then
    echo "✅ Prisma client ready"
else
    echo "❌ Failed to generate Prisma client"
    exit 1
fi

# Verify build exists
echo "🔍 Verifying production build exists..."
if [ ! -f ".next/prerender-manifest.json" ]; then
    echo "⚠️ Build not found - this should have been built during deployment"
    echo "❌ Production cannot start without a build"
    exit 1
fi

echo "✅ Production build verified"

# Function to handle graceful shutdown
cleanup() {
    echo "🛑 Shutting down services gracefully..."
    
    # Send SIGTERM to all child processes
    for job in $(jobs -p); do
        echo "🔄 Stopping process $job"
        kill -TERM $job 2>/dev/null || true
    done
    
    # Wait for processes to finish
    wait
    
    echo "👋 All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT SIGHUP

# Kill any existing processes to ensure clean start
echo "🧹 Cleaning up any existing processes..."
pkill -9 -f "sync-worker" 2>/dev/null || true
pkill -9 -f "worker/sync" 2>/dev/null || true
pkill -9 -f "next start" 2>/dev/null || true
pkill -9 -f "node.*worker" 2>/dev/null || true
sleep 2
echo "✅ Old processes cleaned up"

# CRITICAL: Verify DATABASE_URL is available before starting worker
if [ -z "$DATABASE_URL" ]; then
    echo "❌ FATAL: DATABASE_URL is not set in environment"
    echo "❌ Publishing secrets may not be configured properly"
    exit 1
fi

echo "✅ DATABASE_URL is configured and ready"

# Start background worker (logs to stdout for Replit Publishing logs)
# Explicitly pass DATABASE_URL to ensure it's available to the worker
echo "🎯 Starting background worker..."
DATABASE_URL="$DATABASE_URL" NODE_ENV=production npx tsx worker/sync-worker.ts 2>&1 | sed 's/^/[WORKER] /' &
WORKER_PID=$!
echo "✅ Background worker started (PID: $WORKER_PID)"

# Give worker time to initialize
sleep 2

# Start Next.js application (logs to stdout for Replit Publishing logs)
echo "🌐 Starting Next.js application..."
npm start 2>&1 | sed 's/^/[NEXTJS] /' &
NEXTJS_PID=$!
echo "✅ Next.js application started (PID: $NEXTJS_PID)"

echo "🎉 All services running successfully"
echo "📊 Worker PID: $WORKER_PID"
echo "🌐 Next.js PID: $NEXTJS_PID"

# Health check loop
while true; do
    # Check if both processes are still running
    if ! kill -0 $WORKER_PID 2>/dev/null; then
        echo "❌ Background worker died, restarting..."
        DATABASE_URL="$DATABASE_URL" NODE_ENV=production npx tsx worker/sync-worker.ts 2>&1 | sed 's/^/[WORKER] /' &
        WORKER_PID=$!
        echo "🔄 Worker restarted (PID: $WORKER_PID)"
    fi
    
    if ! kill -0 $NEXTJS_PID 2>/dev/null; then
        echo "❌ Next.js application died, restarting..."
        # Kill any lingering Node processes on port 5000
        pkill -f "next start" 2>/dev/null || true
        sleep 2
        npm start 2>&1 | sed 's/^/[NEXTJS] /' &
        NEXTJS_PID=$!
        echo "🔄 Next.js restarted (PID: $NEXTJS_PID)"
    fi
    
    # Wait 30 seconds before next health check
    sleep 30
done
