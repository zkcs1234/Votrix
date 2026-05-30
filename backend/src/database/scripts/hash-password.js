#!/usr/bin/env node
/**
 * Generate a bcrypt hash for manual admin inserts.
 * Usage: node src/database/scripts/hash-password.js "YourPassword"
 */
import { hashPassword } from '../../utils/password.js'

const plain = process.argv[2]

if (!plain) {
  console.error('Usage: node src/database/scripts/hash-password.js "<password>"')
  process.exit(1)
}

const hash = await hashPassword(plain)
console.log(hash)
