#!/bin/bash
# Preinstall script that runs BEFORE npm install to configure /tmp directories

echo "🔧 Preinstall: Setting up npm to use /tmp directory..."

# Create temp directories for npm
mkdir -p /tmp/npm-cache /tmp/npm-tmp /tmp/npm-global

# Configure npm to use /tmp
npm config set cache /tmp/npm-cache
npm config set tmp /tmp/npm-tmp  
npm config set prefix /tmp/npm-global

# Disable UPM
export UPM_DISABLE=1
export REPLIT_UPM_DISABLE=1
export NO_UPM=1

echo "✅ Preinstall: npm configured to use /tmp"