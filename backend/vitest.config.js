import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/__tests__/**/*.test.js', '**/*.test.js'],
    exclude: ['**/node_modules/**', '**/src/**'],
    testTimeout: 10000,
    // Suites that build the whole Express app in beforeAll (e.g. the submission
    // e2e) take ~9s even alone, so the 10s default hook limit fails them
    // whenever the machine is busy running many files in parallel.
    hookTimeout: 30000
  }
})