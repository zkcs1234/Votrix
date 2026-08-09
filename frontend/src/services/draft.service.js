import api from '@/services/api'

const base = (module) => `/organizer/${module}/drafts`

export const draftService = {
  getDraft(module) {
    return api.get(base(module))
  },

  saveDraft(module, data) {
    return api.put(base(module), data)
  },

  deleteDraft(module) {
    return api.delete(base(module))
  },

  publishDraft(module, payload) {
    return api.post(`${base(module)}/publish`, payload)
  },

  uploadBanner(module, file) {
    const formData = new FormData()
    formData.append('banner', file)
    return api.post(`${base(module)}/banner`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
}
