import axios from 'axios'
import { API_BASE_URL, STORAGE_KEYS } from '@/utils/constants'
import { CSRF_HEADER, getCsrfToken, setCsrfToken } from '@/utils/csrf'
import { getItem, removeItem } from '@/utils/storage'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'

let lastToastAt = 0

function maybeToastError(error) {
  const status = error.response?.status
  if (!status || status === 401 || status === 403) return

  const now = Date.now()
  if (now - lastToastAt < 800) return
  lastToastAt = now

  const message =
    error.response?.data?.message ||
    (status >= 500 ? 'Server error. Please try again.' : 'Request failed.')
  useToastStore.getState().error(message)
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

let refreshPromise = null

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

async function ensureCsrfToken() {
  const existingToken = getCsrfToken()
  if (existingToken) return existingToken

  const { data } = await axios.get(`${API_BASE_URL}/auth/csrf`, {
    withCredentials: true,
    params: { t: Date.now() },
  })

  if (data.csrfToken) {
    setCsrfToken(data.csrfToken)
    return data.csrfToken
  }

  return null
}

api.interceptors.request.use(async (config) => {
  const token = getItem(STORAGE_KEYS.ACCESS_TOKEN)
  if (token) {
    if (typeof config.headers.set === 'function') {
      config.headers.set('Authorization', `Bearer ${token}`)
    } else {
      config.headers.Authorization = `Bearer ${token}`
    }
  }

  // Allow Axios/browser to automatically set Content-Type with boundary for FormData
  if (config.data instanceof FormData) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type')
    } else {
      delete config.headers['Content-Type']
    }
  }

  const method = config.method?.toLowerCase()
  if (method && MUTATING_METHODS.has(method)) {
    const csrf = (await ensureCsrfToken()) || getCsrfToken()
    if (csrf) {
      if (typeof config.headers.set === 'function') {
        config.headers.set(CSRF_HEADER, csrf)
      } else {
        config.headers[CSRF_HEADER] = csrf
      }
    }
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const message = String(error.response?.data?.message || '')

    if (
      status === 403 &&
      original &&
      !original._csrfRetry &&
      !original.url?.includes('/auth/csrf') &&
      message.toLowerCase().includes('csrf')
    ) {
      original._csrfRetry = true

      try {
        const { data } = await axios.get(`${API_BASE_URL}/auth/csrf`, {
          withCredentials: true,
          params: { t: Date.now() },
        })

        if (data.csrfToken) {
          setCsrfToken(data.csrfToken)
          original.headers = original.headers || {}
          if (typeof original.headers.set === 'function') {
            original.headers.set(CSRF_HEADER, data.csrfToken)
          } else {
            original.headers[CSRF_HEADER] = data.csrfToken
          }
        }

        return api(original)
      } catch {
        // Fall through to existing error handling.
      }
    }

    if (status === 403 && error.response?.data?.code === 'MUST_CHANGE_PASSWORD') {
      return Promise.reject(error)
    }

    if (
      status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/admin/login') &&
      !original.url?.includes('/auth/organizer/login') &&
      !original.url?.includes('/auth/voter/login')
    ) {
      original._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
            .finally(() => {
              refreshPromise = null
            })
        }

        const { data } = await refreshPromise

        if (data.accessToken) {
          if (data.csrfToken) setCsrfToken(data.csrfToken)
          useAuthStore.getState().setSession({
            accessToken: data.accessToken,
            user: data.user ?? useAuthStore.getState().user,
            csrfToken: data.csrfToken,
          })
          if (typeof original.headers.set === 'function') {
            original.headers.set('Authorization', `Bearer ${data.accessToken}`)
            if (data.csrfToken) {
              original.headers.set(CSRF_HEADER, data.csrfToken)
            }
          } else {
            original.headers.Authorization = `Bearer ${data.accessToken}`
            if (data.csrfToken) {
              original.headers[CSRF_HEADER] = data.csrfToken
            }
          }
        }

        return api(original)
      } catch {
        removeItem(STORAGE_KEYS.ACCESS_TOKEN)
        removeItem(STORAGE_KEYS.USER)
      }
    }

    if (status === 401 && !original?.url?.includes('/auth/')) {
      removeItem(STORAGE_KEYS.ACCESS_TOKEN)
      removeItem(STORAGE_KEYS.USER)
    }

    maybeToastError(error)
    return Promise.reject(error)
  },
)

export default api
