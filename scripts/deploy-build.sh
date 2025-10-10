#!/bin/bash
# Standard production build script

set -e

echo "🚀 Starting production build..."

# Ensure we're in the correct directory
cd /home/runner/workspace || exit 1
echo "📍 Working directory: $(pwd)"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Build Next.js application
echo "🔨 Building Next.js application..."
npm run build

echo "✅ Production build completed successfully!"
