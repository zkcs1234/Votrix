import axios from 'axios'
import { API_BASE_URL } from '@/utils/constants'

// Public (no session). Plain axios on purpose: this must keep working during
// maintenance, when the shared api client's error handling would get in the way.
export const platformService = {
  get() {
    return axios.get(`${API_BASE_URL}/public/platform`, {
      withCredentials: true,
      params: { t: Date.now() },
    })
  },
}
