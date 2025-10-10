#!/bin/bash

# Bulletproof Job Queue Monitoring Script
# This runs every 5 minutes to automatically heal stuck jobs

echo "🔄 $(date): Running automated job queue monitoring..."

# Call the monitoring endpoint
curl -s "https://gardencommand.com/api/admin/monitor-jobs" | jq .

# Log for visibility  
echo "✅ $(date): Monitoring cycle complete"