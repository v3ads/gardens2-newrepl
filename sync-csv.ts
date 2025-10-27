import { MasterCSVSync } from './lib/master-csv-sync'

async function main() {
  console.log('Starting manual CSV sync...')
  const result = await MasterCSVSync.syncMasterCSV()
  console.log('Sync result:', JSON.stringify(result, null, 2))
  process.exit(result.success ? 0 : 1)
}

main().catch(error => {
  console.error('Sync failed:', error)
  process.exit(1)
})
