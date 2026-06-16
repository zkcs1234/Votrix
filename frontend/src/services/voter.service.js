import api from '@/services/api'

export const voterService = {
  getOverview() {
    return api.get('/voter/overview')
  },
  getLoginRedirect() {
    return api.get('/voter/login-redirect')
  },
}

export const EVENT_TYPE_META = {
  election: { label: 'Election', color: 'indigo' },
  pageant: { label: 'Pageant', color: 'pink' },
  competition_scoring: { label: 'Competition', color: 'pink' },
  polling: { label: 'Poll', color: 'cyan' },
}
