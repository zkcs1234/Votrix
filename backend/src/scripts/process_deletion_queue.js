#!/usr/bin/env node

/**
 * VOTRIX Background Worker: Image Deletion Queue Processor
 * 
 * This script processes the image_deletion_queue table, retrying failed
 * Cloudinary deletions with exponential backoff. Failed items are retried
 * up to 5 times before being marked as permanently failed.
 * 
 * Can be run as:
 * 1. One-shot job: node backend/src/scripts/process_deletion_queue.js
 * 2. Continuous worker: node backend/src/scripts/process_deletion_queue.js --daemon
 * 3. Scheduled cron job: */5 * * * * node backend/src/scripts/process_deletion_queue.js
 * 
 * Usage:
 *   One-shot:   node backend/src/scripts/process_deletion_queue.js
 *   Daemon:     node backend/src/scripts/process_deletion_queue.js --daemon --interval 60000
 */

import { processDeletionQueue } from '../services/imageAsset.service.js'

const DAEMON_MODE = process.argv.includes('--daemon')
const INTERVAL = parseInt(process.argv.find(arg => arg.startsWith('--interval='))?.split('=')[1] || '60000', 10)
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '20', 10)

/**
 * Single queue processing pass
 */
async function processQueue() {
  console.log(`[${new Date().toISOString()}] Processing deletion queue (batch size: ${BATCH_SIZE})...`)
  
  try {
    await processDeletionQueue(BATCH_SIZE)
    console.log(`[${new Date().toISOString()}] Queue processing complete`)
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Queue processing error:`, err.message)
  }
}

/**
 * Daemon mode - runs continuously
 */
async function runDaemon() {
  console.log('='.repeat(80))
  console.log('VOTRIX Image Deletion Queue Worker (Daemon Mode)')
  console.log('='.repeat(80))
  console.log(`Interval: ${INTERVAL}ms`)
  console.log(`Batch size: ${BATCH_SIZE}`)
  console.log(`Started at: ${new Date().toISOString()}`)
  console.log('='.repeat(80))

  // Process immediately on startup
  await processQueue()

  // Then process at regular intervals
  setInterval(async () => {
    await processQueue()
  }, INTERVAL)

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n\nShutting down gracefully...')
    process.exit(0)
  })
}

/**
 * One-shot mode - runs once then exits
 */
async function runOnce() {
  console.log('='.repeat(80))
  console.log('VOTRIX Image Deletion Queue Worker (One-Shot Mode)')
  console.log('='.repeat(80))
  console.log(`Batch size: ${BATCH_SIZE}`)
  console.log(`Started at: ${new Date().toISOString()}`)
  console.log('='.repeat(80))

  await processQueue()

  console.log('='.repeat(80))
  console.log('Processing complete')
  console.log('='.repeat(80))
}

// Run worker if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (DAEMON_MODE) {
    runDaemon().catch((err) => {
      console.error('Daemon failed:', err)
      process.exit(1)
    })
  } else {
    runOnce()
      .then(() => {
        console.log('\n✅ Worker finished successfully')
        process.exit(0)
      })
      .catch((err) => {
        console.error('\n❌ Worker failed:', err)
        process.exit(1)
      })
  }
}

export { processQueue, runDaemon, runOnce }
