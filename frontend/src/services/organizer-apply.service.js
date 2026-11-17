import api from '@/services/api'

// Public, token-gated organizer application. The invitation token is the only
// credential; no session is required. CSRF is attached by the api interceptor.
const base = '/public/organizer-apply'

// Public page: an existing login restored in the background while it loads must
// not make the response look stale (see skipIdentityCheck in api.js).
const publicRequest = { skipIdentityCheck: true }

export const organizerApplyService = {
  getForm(token) {
    return api.get(`${base}/${encodeURIComponent(token)}`, publicRequest)
  },
  // `formData` carries the text fields plus one or more `certificates` files.
  submit(token, formData) {
    return api.post(`${base}/${encodeURIComponent(token)}`, formData, publicRequest)
  },
}
