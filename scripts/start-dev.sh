#!/bin/bash

# Development startup script for Cynthia Gardens Command Center
# Runs both Next.js application and background worker with auto-login enabled

set -e

# Ensure we're in the correct directory
cd /home/runner/workspace || exit 1

echo "🚀 Starting Cynthia Gardens Command Center (Development Mode)"
echo "📊 Environment: development"
echo "📍 Working directory: $(pwd)"
echo "🔓 Auto-login enabled for vipaymanshalaby@gmail.com"
echo "🕐 Started at: $(date)"

# Create persistent logs directory (survives deployments)
mkdir -p logs

# Clean up any corrupted build artifacts for dev mode
echo "🧹 Cleaning corrupted build artifacts..."
rm -rf .next-dev
echo "✅ Ready for fresh dev build"

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

# Start background worker in development mode (connects to development database)
echo "🎯 Starting background worker..."
NODE_ENV=development npx tsx worker/sync-worker.ts >> logs/worker.log 2>&1 &
WORKER_PID=$!
echo "✅ Background worker started (PID: $WORKER_PID)"

# Give worker time to initialize
sleep 2

# Start Next.js application in development mode with auto-login
echo "🌐 Starting Next.js application..."
NEXT_DIST_DIR=.next-dev npm run dev:raw >> logs/nextjs.log 2>&1 &
NEXTJS_PID=$!
echo "✅ Next.js application started (PID: $NEXTJS_PID)"

echo "🎉 All services running successfully"
echo "📊 Worker PID: $WORKER_PID"
echo "🌐 Next.js PID: $NEXTJS_PID"

# Initialize failure tracking
NEXTJS_RESTART_COUNT=0
LAST_RESTART_TIME=0

# Health check loop with enhanced stability monitoring
# WATCHDOG BEHAVIOR:
# - Detects TypeScript/module errors on FIRST crash and exits immediately (fail-fast)
# - After 3 rapid crashes (within 60 seconds each), performs aggressive cleanup
# - Uses PID-scoped process cleanup to avoid terminating unrelated Next.js instances
# - Provides clear error messages and debugging hints when failures occur
while true; do
    # Check if both processes are still running
    if ! kill -0 $WORKER_PID 2>/dev/null; then
        echo "❌ Background worker died, restarting..."
        NODE_ENV=development npx tsx worker/sync-worker.ts >> logs/worker.log 2>&1 &
        WORKER_PID=$!
        echo "🔄 Worker restarted (PID: $WORKER_PID)"
    fi
    
    if ! kill -0 $NEXTJS_PID 2>/dev/null; then
        echo "❌ Next.js application died (PID: $NEXTJS_PID)"
        
        # FAIL-FAST: Check for TypeScript compilation errors immediately on FIRST crash
        if tail -100 logs/nextjs.log 2>/dev/null | grep -q "Type error:"; then
            echo "🚨 FATAL: TypeScript compilation errors detected"
            echo "📋 Compilation errors:"
            tail -100 logs/nextjs.log | grep -A 5 "Type error:" | head -20
            echo ""
            echo "💡 Fix the TypeScript errors above and restart the server"
            echo "🛑 Exiting immediately to prevent crash loop"
            exit 1
        fi
        
        # FAIL-FAST: Check for persistent MODULE_NOT_FOUND errors immediately on FIRST crash
        if tail -100 logs/nextjs.log 2>/dev/null | grep -q "MODULE_NOT_FOUND"; then
            echo "🚨 FATAL: Module loading errors detected (corrupted build cache)"
            echo "📋 Module errors:"
            tail -100 logs/nextjs.log | grep -A 3 "MODULE_NOT_FOUND" | head -20
            echo ""
            echo "💡 Run: rm -rf .next .next-dev && npm run dev"
            echo "🛑 Exiting immediately to prevent crash loop"
            exit 1
        fi
        
        CURRENT_TIME=$(date +%s)
        TIME_SINCE_LAST_RESTART=$((CURRENT_TIME - LAST_RESTART_TIME))
        
        # Track rapid restarts (within 60 seconds)
        if [ $TIME_SINCE_LAST_RESTART -lt 60 ] && [ $LAST_RESTART_TIME -gt 0 ]; then
            NEXTJS_RESTART_COUNT=$((NEXTJS_RESTART_COUNT + 1))
            echo "⚠️  Rapid restart #$NEXTJS_RESTART_COUNT (within 60 seconds)"
        else
            # Reset counter after stable run
            NEXTJS_RESTART_COUNT=0
        fi
        
        # After 3+ rapid crashes, perform aggressive cleanup
        if [ $NEXTJS_RESTART_COUNT -ge 3 ]; then
            echo "🚨 CRASH LOOP DETECTED: $NEXTJS_RESTART_COUNT rapid restarts"
            echo "🧹 Performing aggressive cleanup of ALL build artifacts..."
            
            # PID-scoped cleanup: only kill our tracked Next.js process
            if [ -n "$NEXTJS_PID" ]; then
                kill -9 $NEXTJS_PID 2>/dev/null || true
                # Also clean up any child processes of our PID
                pkill -9 -P $NEXTJS_PID 2>/dev/null || true
            fi
            sleep 3
            
            # Delete all build directories
            rm -rf .next .next-dev node_modules/.cache 2>/dev/null || true
            echo "✅ Aggressive cleanup complete"
            
            echo "🔄 Attempting restart after aggressive cleanup..."
            NEXTJS_RESTART_COUNT=0
        else
            # Normal restart: PID-scoped cleanup only
            if [ -n "$NEXTJS_PID" ]; then
                kill -9 $NEXTJS_PID 2>/dev/null || true
                pkill -9 -P $NEXTJS_PID 2>/dev/null || true
            fi
            sleep 3
        fi
        
        LAST_RESTART_TIME=$CURRENT_TIME
        
        # Restart Next.js
        echo "🔄 Restarting Next.js..."
        NEXT_DIST_DIR=.next-dev npm run dev:raw >> logs/nextjs.log 2>&1 &
        NEXTJS_PID=$!
        echo "✅ Next.js restarted (PID: $NEXTJS_PID)"
        
        # Wait longer after restart before next health check
        sleep 15
    fi
    
    # Wait 30 seconds before next health check
    sleep 30
done
