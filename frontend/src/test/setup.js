// Vitest global setup: adds jest-dom matchers (toBeInTheDocument, etc.) and
// clears the DOM between tests. Loaded via vite.config.js `test.setupFiles`.
import '@testing-library/jest-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

beforeEach(() => {
  for (const name of [
    'VITE_COMPETITION_NATIVE_SCORING_ENABLED',
    'VITE_COMPETITION_NATIVE_SETUP_ENABLED',
    'VITE_COMPETITION_NATIVE_TABULATION_ENABLED',
    'VITE_COMPETITION_NATIVE_RESULTS_ENABLED',
  ]) {
    vi.stubEnv(name, 'false')
  }
})

afterEach(() => {
  cleanup()
})
