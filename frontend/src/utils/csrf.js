import { STORAGE_KEYS } from '@/utils/constants'
import { getItem, removeItem, setItem } from '@/utils/storage'

export const CSRF_HEADER = 'X-CSRF-Token'

export function getCsrfToken() {
  return getItem(STORAGE_KEYS.CSRF_TOKEN)
}

export function setCsrfToken(token) {
  if (token) setItem(STORAGE_KEYS.CSRF_TOKEN, token)
  else removeItem(STORAGE_KEYS.CSRF_TOKEN)
}

export function clearCsrfToken() {
  removeItem(STORAGE_KEYS.CSRF_TOKEN)
}
