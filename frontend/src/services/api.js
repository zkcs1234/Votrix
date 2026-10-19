import axios from 'axios'
import { API_BASE_URL } from '@/utils/constants'
import { CSRF_HEADER, getCsrfToken, setCsrfToken } from '@/utils/csrf'

import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { getErrorMessage } from '@/utils/getErrorMessage'
import {competitionRetryDelay} from '@/utils/competitionRetry'
const nativeRetryUntil=new Map()
const nativeRetryKey=config=>`${config?._authIdentity??'public'}:competition`
const nativeRequest=config=>/\/(competition|pageant)(\/|$)/.test(config?.url??'')&&(import.meta.env.VITE_COMPETITION_NATIVE_SCORING_ENABLED==='true'||import.meta.env.VITE_COMPETITION_NATIVE_SETUP_ENABLED==='true'||import.meta.env.VITE_COMPETITION_NATIVE_RESULTS_ENABLED==='true')
const setupEndpoint=config=>String(config?.url??'').split('?')[0].replace(/\/(events|competitions|competition|pageant|contestants|entries|judges)\/[^/]+/gi,'/$1/:id').replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'/:id')

let lastToastAt = 0

function maybeToastError(error) {
  const status = error.response?.status
  if (!status || status === 401 || status === 403) return

  const now = Date.now()
  if (now - lastToastAt < 800) return
  lastToastAt = now

  useToastStore.getState().error(getErrorMessage(error))
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

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

let refreshPromise = null

// One refresh owns one authenticated identity. Network outages must not destroy
// local scoring work, and a late response must not restore an old account.
export async function refreshSession() {
  if (!refreshPromise) {
    const identity = useAuthStore.getState().user?.id
    refreshPromise = axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        if (useAuthStore.getState().user?.id !== identity) {
          const stale = new Error('Authentication identity changed during refresh')
          stale.staleIdentity = true
          throw stale
        }
        if (data.csrfToken) setCsrfToken(data.csrfToken)
        useAuthStore.getState().setSession({ user: data.user ?? useAuthStore.getState().user, csrfToken: data.csrfToken })
        window.dispatchEvent(new Event('votrix-token-refreshed'))
        return data
      })
      .catch(error => {
        if ([401, 403].includes(error.response?.status) && useAuthStore.getState().user?.id === identity) {
          useAuthStore.getState().clearSession()
        }
        throw error
      })
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

export { ensureCsrfToken }

api.interceptors.request.use(async (config) => {
  const identity = useAuthStore.getState().user?.id ?? null
  if (config._authIdentity === undefined) config._authIdentity = identity
  else if (config._authIdentity !== identity) {
    const stale = new Error('Request belongs to an earlier authentication identity')
    stale.staleIdentity = true
    throw stale
  }
  // Strip stale headers from an old bundle or a retried request during migration.
  if (typeof config.headers?.delete === 'function') config.headers.delete('Authorization')
  else for (const key of Object.keys(config.headers ?? {})) if (key.toLowerCase() === 'authorization') delete config.headers[key]
  if(nativeRequest(config)){
    if(import.meta.env.DEV&&!config._setupStartedAt)config._setupStartedAt=performance.now()
    const until=nativeRetryUntil.get(nativeRetryKey(config))??0
    if(until>Date.now()){const error=new Error('Competition requests are temporarily limited. Recovery will retry automatically.');error.config=config;error.competitionBackoff=true;error.response={status:429,headers:{'retry-after':String(Math.ceil((until-Date.now())/1000))},data:{message:error.message}};error.retryAfterMs=until-Date.now();return Promise.reject(error)}
    nativeRetryUntil.delete(nativeRetryKey(config))
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

  if (config._authIdentity !== (useAuthStore.getState().user?.id ?? null)) {
    const stale = new Error('Authentication changed before the request could be sent')
    stale.staleIdentity = true
    throw stale
  }

  return config
})

api.interceptors.response.use(
  (response) => {
    if(import.meta.env.DEV&&nativeRequest(response.config)&&response.config._setupStartedAt!==undefined)console.debug('[competition-setup] request',response.config.method?.toUpperCase(),setupEndpoint(response.config),Math.round(performance.now()-response.config._setupStartedAt),'ms',response.status)
    if (response.config?._authIdentity !== undefined && response.config._authIdentity !== (useAuthStore.getState().user?.id ?? null)) {
      const stale = new Error('Response belongs to an earlier authentication identity')
      stale.staleIdentity = true
      throw stale
    }
    return response
  },
  async (error) => {
    const original = error.config
    const status = error.response?.status
    if(import.meta.env.DEV&&nativeRequest(original)&&original?._setupStartedAt!==undefined)console.debug('[competition-setup] request failed',original.method?.toUpperCase(),setupEndpoint(original),Math.round(performance.now()-original._setupStartedAt),'ms',status??'cancelled')
    const message = String(error.response?.data?.message || '')
    if(status===429&&nativeRequest(original)){
      error.retryAfterMs=competitionRetryDelay(error)
      if(!error.competitionBackoff){if(nativeRetryUntil.size>=500)nativeRetryUntil.delete(nativeRetryUntil.keys().next().value);nativeRetryUntil.set(nativeRetryKey(original),Date.now()+error.retryAfterMs)}
      return Promise.reject(error)
    }
    if (original?._authIdentity !== undefined && original._authIdentity !== (useAuthStore.getState().user?.id ?? null)) {
      return Promise.reject(error)
    }

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
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/admin/login') &&
      !original.url?.includes('/auth/organizer/login') &&
      !original.url?.includes('/auth/voter/login')
    ) {
      original._retry = true

      try {
        const data = await refreshSession()

        // Add CSRF to retry request if needed
        if (data.csrfToken) {
          if (typeof original.headers.set === 'function') {
            original.headers.set(CSRF_HEADER, data.csrfToken)
          } else {
            original.headers[CSRF_HEADER] = data.csrfToken
          }
        }

        return api(original)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    if (status === 401 && !original?.url?.includes('/auth/')) {
      useAuthStore.getState().clearSession()
    }

    maybeToastError(error)
    return Promise.reject(error)
  },
)

export default api
