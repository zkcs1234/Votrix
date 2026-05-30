import { useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL, STORAGE_KEYS } from '@/utils/constants'
import { setCsrfToken } from '@/utils/csrf'
import { getItem } from '@/utils/storage'

export function useCsrfBootstrap() {
  useEffect(() => {
    if (getItem(STORAGE_KEYS.CSRF_TOKEN)) return

    axios
      .get(`${API_BASE_URL}/auth/csrf`, { withCredentials: true })
      .then(({ data }) => {
        if (data.csrfToken) setCsrfToken(data.csrfToken)
      })
      .catch(() => {
        /* non-fatal until first mutating request */
      })
  }, [])
}
