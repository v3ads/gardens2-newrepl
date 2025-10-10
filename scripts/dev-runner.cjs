#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Next.js dev server supervisor...');

// Ensure we're in the correct directory
process.chdir(path.resolve(__dirname, '..'));
console.log('Working directory:', process.cwd());

let nextProcess;
let restartCount = 0;

function startNextjs() {
  console.log(`🚀 Starting Next.js dev server (attempt ${restartCount + 1})...`);
  
  // Spawn Next.js dev server with completely clean CI-free environment
  const env = { ...process.env, NEXT_DIST_DIR: '.next-dev' };
  
  // Remove ALL CI detection environment variables
  const CI_ENV_VARS = [
    'CI', 'CONTINUOUS_INTEGRATION', 'BUILD_NUMBER', 'RUN_ID', 'RUN_NUMBER',
    'GITHUB_ACTIONS', 'GITLAB_CI', 'TRAVIS', 'CIRCLECI', 'APPVEYOR', 'BUILDKITE',
    'DRONE', 'TEAMCITY_VERSION', 'TF_BUILD', 'BITBUCKET_PIPELINE_UUID',
    'BITBUCKET_BUILD_NUMBER', 'JENKINS_URL', 'HUDSON_URL', 'SEMAPHORE',
    'CIRRUS_CI', 'GO_PIPELINE_LABEL', 'VERCEL', 'NOW_BUILDER', 'NETLIFY'
  ];
  
  const removedVars = [];
  for (const k of CI_ENV_VARS) {
    if (env[k]) {
      removedVars.push(k);
      delete env[k];
    }
  }
  
  // Ensure friendly TTY environment
  env.TERM = env.TERM || 'xterm-256color';
  env.FORCE_COLOR = env.FORCE_COLOR || '1';
  
  console.log(`🧹 Removed CI variables: ${removedVars.length > 0 ? removedVars.join(', ') : 'none'}`);
  
  // Spawn Next.js binary directly with open stdin to prevent auto-shutdown
  nextProcess = spawn(process.execPath, [
    require.resolve('next/dist/bin/next'), 
    'dev', 
    '-p', '5000', 
    '-H', '0.0.0.0'
  ], {
    stdio: ['pipe', 'inherit', 'inherit'], // Provide open stdin pipe
    env
  });
  
  // Keep child stdin open so Next dev doesn't exit on EOF
  nextProcess.stdin.resume();
  
  console.log(`🔗 Started Next.js process with PID: ${nextProcess.pid}`);

  // Auto-restart when process exits
  nextProcess.on('exit', (code, signal) => {
    restartCount++;
    console.log(`📋 Next.js process exited with code ${code} and signal ${signal}`);
    console.log(`🔄 Auto-restarting in 2 seconds... (restart #${restartCount})`);
    
    setTimeout(() => {
      startNextjs();
    }, 2000); // Wait 2 seconds before restart
  });

  nextProcess.on('error', (error) => {
    console.error('❌ Next.js process error:', error);
    console.log('🔄 Restarting after error in 3 seconds...');
    setTimeout(() => {
      startNextjs();
    }, 3000);
  });
}

// Start Next.js for the first time
startNextjs();

// Keep supervisor alive
process.stdin.resume();

// Handle termination signals
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, terminating Next.js...');
  nextProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, terminating Next.js...');
  nextProcess.kill('SIGINT');
});

console.log('✅ Supervisor started, Next.js should be running...');