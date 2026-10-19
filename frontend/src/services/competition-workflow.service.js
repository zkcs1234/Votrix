import api from './api'
const org = id => `/organizer/competition/events/${id}`
const judge = id => `/participant/competition/events/${id}`
export const workflowService = {
  createRoundCriterion:(id,roundId,payload)=>api.post(`${org(id)}/rounds/${roundId}/criteria`,payload),
  rules: id => api.get(`${org(id)}/workflow/rules`),
  tabulation: (id,roundId) => api.get(`${org(id)}/workflow/tabulation`,{params:roundId?{roundId}:undefined}),
  action: (id,action,payload={}) => api.post(`${org(id)}/workflow/${action}`,payload),
  draft: (id,payload) => api.post(`${judge(id)}/session-draft`,payload),
  submit: (id,payload) => api.post(`${judge(id)}/submit-round`,payload),
  verify: (id,calculationId,payload={}) => api.post(`${org(id)}/workflow/calculations/${calculationId}/verify`,payload),
  reviewerVerify: (id,calculationId,payload={}) => api.post(`${judge(id)}/calculations/${calculationId}/verify`,payload),
  approveAmendment: (id,payload) => api.post(`${judge(id)}/amendments/approve`,payload),
  review: id => api.get(`${judge(id)}/verification`),
  getPublishedResults: id => api.get(`${judge(id)}/published-results`),
  approve: (id,payload) => api.post(`${judge(id)}/decisions/approve`,payload),
  exportExcel: (id,roundId) => api.get(`${org(id)}/workflow/excel`,{responseType:'blob',params:roundId?{roundId}:undefined}),
  importExcel: (id,file,roundId) => {const form=new FormData();form.append('file',file);if(roundId)form.append('roundId',roundId);return api.post(`${org(id)}/workflow/excel/verify`,form)},
}
