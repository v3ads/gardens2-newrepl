#!/bin/bash
# Ultra-optimized deployment build script to avoid disk quota issues

echo "🚀 Starting ultra-optimized deployment build..."

# Ensure we're in the correct directory
cd /home/runner/workspace || exit 1
echo "📍 Working directory: $(pwd)"

# Disable UPM completely
echo "🚫 Disabling UPM package manager..."
export UPM_DISABLE=1
export REPLIT_UPM_DISABLE=1
export NO_UPM=1

# Configure npm to use /tmp for everything to avoid quota issues
echo "⚙️ Configuring npm to use /tmp directory..."
export npm_config_cache=/tmp/npm-cache-$$
export npm_config_tmp=/tmp/npm-tmp-$$
export npm_config_prefix=/tmp/npm-global-$$
export npm_config_userconfig=/tmp/.npmrc
export npm_config_globalconfig=/tmp/.npmrc
export npm_config_store=/tmp/npm-store-$$
export NPM_CONFIG_LOGLEVEL=error

# Create necessary temp directories
mkdir -p $npm_config_cache $npm_config_tmp $npm_config_prefix

# Maximum cleanup before starting
echo "🧹 Maximum cleanup to free all available space..."
# Remove all build artifacts
rm -rf node_modules .next .next-dev attached_assets 2>/dev/null || true
# Clear all npm/yarn caches
rm -rf ~/.npm ~/.yarn ~/.cache/npm ~/.cache/yarn 2>/dev/null || true
# Clear UPM completely
rm -rf .upm/store.json .upm/lock .upm/* 2>/dev/null || true
# Clear temp files
rm -rf /tmp/* /tmp/.* 2>/dev/null || true
# Remove log files
rm -f *.log build.log tsconfig.tsbuildinfo 2>/dev/null || true
# Remove large data files if any
find ./data -name "*.csv" -size +1M -delete 2>/dev/null || true
find ./data -name "*.db" -size +10M -delete 2>/dev/null || true

echo "✅ Cleanup complete"

# Show available space
echo "📊 Available disk space before install:"
df -h . | tail -1

# Install production dependencies with absolute minimal footprint
echo "📦 Installing production dependencies with minimal footprint..."
# Use --no-save to avoid writing to package.json
# Use --no-package-lock to avoid lock file updates
# Use --no-shrinkwrap to avoid shrinkwrap
npm install --production \
  --no-save \
  --no-package-lock \
  --no-shrinkwrap \
  --no-audit \
  --no-fund \
  --prefer-offline \
  --legacy-peer-deps \
  --no-optional

# Install Prisma temporarily for build
echo "🔧 Installing Prisma CLI temporarily..."
npm install --no-save prisma@^6.16.3 \
  --no-audit \
  --no-fund \
  --no-package-lock \
  --legacy-peer-deps

# Generate Prisma client
echo "🔧 Generating Prisma client..."
NODE_OPTIONS='--max-old-space-size=2048' npx prisma generate

# Build with strict memory limits
echo "🔨 Building production application..."
NODE_OPTIONS='--max-old-space-size=3072' npm run build

# Aggressive post-build cleanup
echo "🧹 Post-build cleanup..."
rm -rf $npm_config_cache $npm_config_tmp $npm_config_prefix 2>/dev/null || true
rm -rf /tmp/npm-* /tmp/.npm* 2>/dev/null || true
rm -rf .next/cache 2>/dev/null || true
find . -name "*.map" -delete 2>/dev/null || true

echo "✅ Deployment build completed successfully!"
echo "📊 Final disk usage:"
df -h . | tail -1