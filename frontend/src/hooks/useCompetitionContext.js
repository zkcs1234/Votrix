import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

const contextKey = context => `${context.competitionId}:${context.roundId ?? 'single'}`

// Organizer navigation shares the selected category and round through the URL.
// Reviewer and judge workspaces keep their existing local selection behavior.
export default function useCompetitionContext(choices, initialChoice, syncUrl) {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [localSelection, setLocalSelection] = useState(contextKey(initialChoice ?? choices[0]))
  const requested = syncUrl && choices.find(context =>
    context.competitionId === params.get('competitionId') &&
    (params.get('roundId') == null || context.roundId === params.get('roundId')),
  )
  const choice = syncUrl
    ? requested || initialChoice || choices[0]
    : choices.find(context => contextKey(context) === localSelection) ?? choices[0]

  useEffect(() => {
    if (!syncUrl) return
    const next = new URLSearchParams(params)
    next.set('competitionId', choice.competitionId)
    if (choice.roundId) next.set('roundId', choice.roundId)
    else next.delete('roundId')
    if (next.toString() !== params.toString()) navigate({ pathname: location.pathname, search: `?${next}`, hash: location.hash }, { replace: true })
  }, [syncUrl, choice.competitionId, choice.roundId, params, navigate, location.pathname, location.hash])

  const setSelected = selected => {
    if (!syncUrl) return setLocalSelection(selected)
    const nextChoice = choices.find(context => contextKey(context) === selected)
    if (!nextChoice) return
    const next = new URLSearchParams(params)
    next.set('competitionId', nextChoice.competitionId)
    if (nextChoice.roundId) next.set('roundId', nextChoice.roundId)
    else next.delete('roundId')
    navigate({ pathname: location.pathname, search: `?${next}`, hash: location.hash }, { replace: true })
  }

  return { choice, selected: contextKey(choice), setSelected }
}
