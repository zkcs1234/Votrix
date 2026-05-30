import api from '@/services/api'

export const voterService = {
  getOverview() {
    return api.get('/voter/overview')
  },
}

export const EVENT_TYPE_META = {
  election: { label: 'Election', color: 'indigo' },
  pageant: { label: 'Pageant', color: 'pink' },
  polling: { label: 'Poll', color: 'cyan' },
}
