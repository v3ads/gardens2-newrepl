#!/bin/bash
# Real-time sync monitoring script

echo "🔍 Cynthia Gardens Sync Monitor"
echo "================================"
echo ""

while true; do
  clear
  echo "🔍 Sync Status - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "================================"
  echo ""
  
  # Check sync lock
  LOCK_INFO=$(psql $DATABASE_URL -t -c "
    SELECT 
      sync_type,
      current_step || '/' || total_steps as step,
      current_progress,
      NOW() - updated_at as age
    FROM sync_locks 
    WHERE id = 'daily_sync_lock'
  " 2>/dev/null)
  
  if [ -n "$LOCK_INFO" ]; then
    echo "📊 Active Sync:"
    echo "$LOCK_INFO" | awk -F'|' '{
      printf "  Type: %s\n", $1
      printf "  Step: %s\n", $2
      printf "  Progress: %s\n", $3
      printf "  Last Update: %s ago\n", $4
    }'
    echo ""
    
    # Check for stuck status (no update in 2+ minutes)
    AGE_SECONDS=$(psql $DATABASE_URL -t -c "
      SELECT EXTRACT(EPOCH FROM (NOW() - updated_at))::integer
      FROM sync_locks WHERE id = 'daily_sync_lock'
    " 2>/dev/null | tr -d ' ')
    
    if [ "$AGE_SECONDS" -gt 120 ]; then
      echo "⚠️  WARNING: No progress update in ${AGE_SECONDS}s - sync may be stuck!"
      echo ""
    fi
  fi
  
  # Check running jobs
  JOB_INFO=$(psql $DATABASE_URL -t -c "
    SELECT 
      id,
      type,
      EXTRACT(EPOCH FROM (NOW() - created_at))::integer as elapsed_sec,
      last_error
    FROM job_queue 
    WHERE status = 'RUNNING'
    ORDER BY created_at DESC
    LIMIT 1
  " 2>/dev/null)
  
  if [ -n "$JOB_INFO" ]; then
    echo "⚙️  Running Job:"
    echo "$JOB_INFO" | awk -F'|' '{
      id = $1
      type = $2
      elapsed = $3
      error = $4
      
      minutes = int(elapsed / 60)
      seconds = elapsed % 60
      
      printf "  ID: %s\n", id
      printf "  Type: %s\n", type
      printf "  Elapsed: %dm %ds\n", minutes, seconds
      if (length(error) > 5) printf "  Error: %s\n", error
    }'
    echo ""
  fi
  
  # Show recent unit progress from logs (last 3 messages)
  UNIT_PROGRESS=$(tail -500 /tmp/logs/worker.log 2>/dev/null | grep -a "📊 Processing unit" | tail -3)
  if [ -n "$UNIT_PROGRESS" ]; then
    echo "🎯 Recent Unit Progress:"
    echo "$UNIT_PROGRESS" | sed 's/^/  /'
    echo ""
  fi
  
  # Show recent heartbeat (proves worker is alive)
  HEARTBEAT=$(tail -100 /tmp/logs/worker.log 2>/dev/null | grep -a "Heartbeat sent" | tail -1)
  if [ -n "$HEARTBEAT" ]; then
    echo "💓 $HEARTBEAT"
    echo ""
  fi
  
  # If nothing is running
  if [ -z "$LOCK_INFO" ] && [ -z "$JOB_INFO" ]; then
    echo "✅ No sync currently running"
    echo ""
    
    # Show last completed job
    LAST_JOB=$(psql $DATABASE_URL -t -c "
      SELECT 
        status,
        updated_at,
        last_error
      FROM job_queue 
      WHERE type = 'DAILY_SYNC'
      ORDER BY updated_at DESC
      LIMIT 1
    " 2>/dev/null)
    
    if [ -n "$LAST_JOB" ]; then
      echo "📝 Last Sync Job:"
      echo "$LAST_JOB" | awk -F'|' '{
        printf "  Status: %s\n", $1
        printf "  Completed: %s\n", $2
        if (length($3) > 5) printf "  Error: %s\n", $3
      }'
    fi
  fi
  
  echo ""
  echo "Press Ctrl+C to exit | Refreshing every 5 seconds..."
  
  sleep 5
done
