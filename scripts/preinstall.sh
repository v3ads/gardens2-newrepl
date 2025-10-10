#!/bin/bash
# Standard preinstall script

echo "📦 Running preinstall checks..."

# Ensure we're using the correct Node version
node --version
npm --version

echo "✅ Preinstall checks complete"
