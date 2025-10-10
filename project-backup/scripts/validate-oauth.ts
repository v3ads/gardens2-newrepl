#!/usr/bin/env tsx

// OAuth validation script to test multi-domain configuration
import { getBaseUrl } from '../lib/base-url'
import { validateEnvironment, getEnvironmentConfig } from '../lib/env-config'

async function validateOAuthSetup() {
  console.log('🔍 Validating OAuth Multi-Domain Setup...\n')
  
  try {
    // Validate environment variables
    validateEnvironment()
    console.log('✅ Environment variables validated')
    
    // Show configuration
    const config = getEnvironmentConfig()
    console.log('📋 Current Configuration:')
    console.log(`   Node Environment: ${config.nodeEnv}`)
    console.log(`   NextAuth URL: ${config.nextauthUrl}`)
    console.log(`   Google Client ID: ${config.googleClientId}`)
    console.log(`   Has Google Secret: ${config.hasGoogleSecret}`)
    console.log(`   Database: ${config.databaseUrl}\n`)
    
    // Test domains that should work
    const testDomains = [
      'gardencommand.com',
      'gardencommand.replit.app', 
      'gardencommand.vipaymanshalaby.repl.co',
      'gardencommand.vipaymanshalaby.replit.dev'
    ]
    
    console.log('🌐 Expected OAuth Callback URLs:')
    testDomains.forEach(domain => {
      console.log(`   https://${domain}/api/auth/callback/google`)
    })
    
    console.log('\n🔧 Google Cloud Console Configuration Required:')
    console.log('   Authorized JavaScript Origins:')
    testDomains.forEach(domain => {
      console.log(`   - https://${domain}`)
    })
    
    console.log('\n   Authorized Redirect URIs:')
    testDomains.forEach(domain => {
      console.log(`   - https://${domain}/api/auth/callback/google`)
    })
    
    console.log('\n✅ OAuth multi-domain setup validation complete!')
    console.log('\n📝 Next steps:')
    console.log('   1. Add all URLs above to Google Cloud Console')
    console.log('   2. Test OAuth login on each domain')
    console.log('   3. Verify /health page shows correct configuration')
    console.log('   4. Deploy with same environment variables')
    
  } catch (error) {
    console.error('❌ Validation failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

if (require.main === module) {
  validateOAuthSetup()
}

export { validateOAuthSetup }