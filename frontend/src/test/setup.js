// Vitest global setup: adds jest-dom matchers (toBeInTheDocument, etc.) and
// clears the DOM between tests. Loaded via vite.config.js `test.setupFiles`.
import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
