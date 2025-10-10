#!/bin/bash

# Generate environment variable files for all deployment domains
# This script creates individual .env files for easy copy-paste setup

echo "🔧 Generating environment variable files for all domains..."

# Base variables that are the same across all deployments
AUTH_TRUST_HOST="true"

# Read sensitive credentials from environment variables
if [[ -z "$NEXTAUTH_SECRET" ]]; then
    echo "❌ Error: NEXTAUTH_SECRET environment variable is required"
    echo "Please set this secret in Replit's Secrets tab"
    exit 1
fi

if [[ -z "$GOOGLE_CLIENT_ID" ]]; then
    echo "❌ Error: GOOGLE_CLIENT_ID environment variable is required"
    echo "Please set this secret in Replit's Secrets tab"
    exit 1
fi

if [[ -z "$GOOGLE_CLIENT_SECRET" ]]; then
    echo "❌ Error: GOOGLE_CLIENT_SECRET environment variable is required"
    echo "Please set this secret in Replit's Secrets tab"
    exit 1
fi

DATABASE_URL="file:./prod.db"

# Define all deployment domains
declare -A domains
domains[replit]="https://gardencommand.replit.app"
domains[custom]="https://gardencommand.com"
domains[repl_co]="https://gardencommand.vipaymanshalaby.repl.co"
domains[replit_dev]="https://gardencommand.vipaymanshalaby.replit.dev"

# Create environment files for each domain
for domain_key in "${!domains[@]}"; do
    domain_url="${domains[$domain_key]}"
    filename="deployment-env-${domain_key}.txt"
    
    echo "Creating: $filename"
    cat > "$filename" << EOF
# Environment Variables for $domain_url
# Copy and paste each line into Deployments → Settings → Environment Variables

NEXTAUTH_URL=$domain_url
AUTH_TRUST_HOST=$AUTH_TRUST_HOST  
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
DATABASE_URL=$DATABASE_URL
EOF
done

echo ""
echo "✅ Generated environment files:"
ls -1 deployment-env-*.txt

echo ""
echo "📋 Usage:"
echo "1. Open the appropriate deployment-env-[domain].txt file"
echo "2. Copy each line and add as environment variable in Replit Deployments"
echo "3. Variable Name = everything before the = sign"
echo "4. Variable Value = everything after the = sign (no quotes)"
echo "5. Save and redeploy"

echo ""
echo "🧪 Test after setup:"
echo "curl -s 'https://[domain]/api/debug' | jq ."