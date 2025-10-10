#!/bin/bash
# Standard production build script

set -e

echo "🚀 Starting production build..."

# Ensure we're in the correct directory
cd /home/runner/workspace || exit 1
echo "📍 Working directory: $(pwd)"

# CRITICAL: Set stub DATABASE_URL for build phase
# Publishing secrets aren't available during build, only at runtime
# This stub allows Prisma CLI to generate the client successfully
export DATABASE_URL="${DATABASE_URL:-postgresql://build:build@localhost:5432/build}"
echo "✅ Build environment configured"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Build Next.js application
echo "🔨 Building Next.js application..."
npm run build

echo "✅ Production build completed successfully!"
