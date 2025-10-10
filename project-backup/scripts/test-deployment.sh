#!/bin/bash
# Comprehensive Deployment Readiness Verification
# Only declare deployment ready when ALL gates pass

set -e
echo "🚀 Starting Deployment Readiness Verification..."

# Gate 1: Environment Preflight
echo ""
echo "Gate 1: Environment Preflight..."
required_vars=("NEXTAUTH_URL" "NEXTAUTH_SECRET" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "DATABASE_URL")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ FAIL: Missing required environment variable: $var"
        exit 1
    fi
done
echo "✅ All required environment variables present"

# Gate 2: Static Integrity  
echo ""
echo "Gate 2: Static Integrity..."
echo "Running TypeScript check..."
if ! npx tsc --noEmit --skipLibCheck; then
    echo "❌ FAIL: TypeScript compilation errors"
    exit 1
fi
echo "✅ TypeScript check passed"

# Gate 3: Clean Production Build
echo ""
echo "Gate 3: Clean Production Build..."
echo "Cleaning cache and dependencies..."
rm -rf .next .next-dev node_modules/.cache

echo "Installing dependencies..."
npm ci

echo "Generating Prisma client..."
npx prisma generate

echo "Running production build..."
if ! npm run build 2>&1 | tee build.log; then
    echo "❌ FAIL: Production build failed"
    cat build.log
    exit 1
fi

# Check for webpack/module resolution errors
if grep -q "Cannot find module\|webpack.*error\|Module not found" build.log; then
    echo "❌ FAIL: Build contains module resolution errors"
    grep "Cannot find module\|webpack.*error\|Module not found" build.log
    exit 1
fi
echo "✅ Clean production build completed successfully"

# Gate 4: Production Runtime Smoke Tests
echo ""
echo "Gate 4: Production Runtime Smoke Tests..."

# Set test mode to disable auto-sync
export DISABLE_AUTOSYNC_DURING_TESTS=1
echo "Auto-sync disabled for testing"

# Start production server in background
echo "Starting production server..."
NODE_ENV=production npm start &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to be ready..."
sleep 15

# Function to test API endpoint
test_api() {
    local endpoint="$1"
    local expected_check="$2" 
    local description="$3"
    
    echo "Testing $description..."
    local response=$(curl -s "http://localhost:5000$endpoint" || echo "CURL_FAILED")
    
    if [ "$response" = "CURL_FAILED" ]; then
        echo "❌ FAIL: $description - Could not connect"
        return 1
    fi
    
    if [ -n "$expected_check" ]; then
        if ! echo "$response" | eval "$expected_check"; then
            echo "❌ FAIL: $description - Invalid response format"
            echo "Response: $response"
            return 1
        fi
    fi
    
    echo "✅ $description - OK"
}

# Test critical endpoints
test_api "/api/sync/status" "jq -e '.lastSyncTime and .isSyncing != null' >/dev/null" "Sync Status API"
test_api "/api/analytics/kpis" "jq -e '.snapshotDate and .occupancy.total_units > 0 and .financial.metrics.actual_mrr > 0' >/dev/null" "Analytics KPIs API"
test_api "/api/features/accessible?role=ADMIN" "jq -e '.features | length > 5' >/dev/null" "Features API"

# Test page loads
echo "Testing page loads..."
for page in "/overview" "/analytics" "/query"; do
    if ! curl -s "http://localhost:5000$page" | grep -q "<!DOCTYPE html>"; then
        echo "❌ FAIL: Page $page does not return valid HTML"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
done
echo "✅ All pages load successfully"

# Gate 5: Auto-sync Safeguards
echo ""
echo "Gate 5: Auto-sync Safeguards..."
echo "Verifying auto-sync is disabled during tests..."
sync_status=$(curl -s "http://localhost:5000/api/sync/status" | jq -r '.isSyncing')
if [ "$sync_status" = "true" ]; then
    echo "❌ FAIL: Auto-sync is running during tests (should be disabled)"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi
echo "✅ Auto-sync properly disabled during tests"

# Clean up
echo ""
echo "Cleaning up test server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

# Final verification
echo ""
echo "🎯 DEPLOYMENT READINESS VERIFICATION: PASSED"
echo ""
echo "✅ All 5 gates passed successfully:"
echo "   ✅ Environment preflight"
echo "   ✅ Static integrity" 
echo "   ✅ Clean production build"
echo "   ✅ Production runtime smoke tests"
echo "   ✅ Auto-sync safeguards"
echo ""
echo "🚀 SYSTEM IS VERIFIED READY FOR DEPLOYMENT"
echo ""
echo "Deployment checklist:"
echo "1. Deploy the exact commit that passed this verification"
echo "2. Use the same build artifact from npm run build"
echo "3. Run the same smoke tests against live URL after deployment"
echo "4. Remove DISABLE_AUTOSYNC_DURING_TESTS after deployment"

exit 0