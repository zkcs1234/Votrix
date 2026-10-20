import { queryClient } from '@/app/queryClient'

const setupQueryKey = (eventId, resource) => ['competition-setup', eventId, resource]

export function fetchCompetitionSetupData(eventId, resource, request) {
  return queryClient.fetchQuery({
    queryKey: setupQueryKey(eventId, resource),
    queryFn: request,
    retry: false,
  })
}

export function invalidateCompetitionSetupData(eventId) {
  return queryClient.invalidateQueries({ queryKey: ['competition-setup', eventId] })
}

export function setCompetitionSetupData(eventId, resource, data) {
  queryClient.setQueryData(setupQueryKey(eventId, resource), data)
}
