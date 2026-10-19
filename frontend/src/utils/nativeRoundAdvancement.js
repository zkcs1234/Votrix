import { applicableDeductionRules } from '../../../shared/competition-deductions.js'

export function nativeRoundAdvancement(view, nextRound) {
  const calculation = view?.complete && !view.calculationStale ? view.calculation : null
  const finalized = !!calculation?.finalized
  const saved = view?.advancement
  const confirmed = finalized && saved?.fromRoundId === view?.roundId && saved?.toRoundId === nextRound?.id && saved?.qualificationCurrent === true
  const count = confirmed ? saved.qualifiedEntryIds?.length ?? 0 : 0
  const hasOrganizerDeductions = applicableDeductionRules(view?.rules?.configuration_snapshot, view?.roundId, 'organizer').length > 0
  const blocker = !view?.complete
    ? { message: 'Required judge submissions are incomplete. Check which judge sheets are missing or need correction.', label: 'Check judge submissions', stage: 'submissions' }
    : view.session?.status !== 'closed'
      ? { message: 'Close this round\u2019s scoring session in Live Control before reviewing advancement.', label: 'Open current round in Live Control', live: true }
      : hasOrganizerDeductions && view.deductionsResolved !== true
        ? { message: 'Resolve the configured organizer deductions before continuing.', label: 'Review deductions', stage: 'deductions' }
        : !calculation
          ? { message: 'A current official calculation is required. Open Validation to check the calculation status.', label: 'Check calculation status', stage: 'calculate' }
          : !finalized && !calculation.verified
            ? { message: view.reviewPolicy?.active
              ? `${view.reviewPolicy.reviewerName ?? 'The assigned independent reviewer'} must verify this calculation from their reviewer account. Then the organizer can finalize this round.`
              : 'Assign an active independent reviewer in Finalization. They must verify the calculation before the organizer can finalize this round.', label: 'Open Finalization', stage: 'results' }
            : !finalized
              ? { message: 'The calculation is verified. Finalize this round with a decision reason before reviewing advancement.', label: 'Finalize this round', stage: 'results' }
              : confirmed && count === 0
                ? { message: 'The confirmed roster has no qualifiers. The next round cannot start with an empty roster.' }
                : !confirmed
                  ? { message: 'Review Advancement, check the proposed qualifiers, enter a decision reason, and confirm the roster to enable the next round.' }
                  : null
  const status = confirmed ? count ? 'Qualifiers confirmed' : 'No qualifiers selected'
    : finalized ? 'Tabulation complete · confirm qualifiers'
      : calculation?.verified ? 'Verified · finalize this round'
        : calculation ? 'Calculated · independent verification required'
          : view?.complete ? view.session?.status === 'closed' ? 'Official calculation pending' : 'Close scoring after all submissions'
            : 'Awaiting complete judge submissions'
  return { finalized, confirmed, count, status, blocker, canProceed: confirmed && count > 0,
    checks: [
      ['All current judge sheets complete', view?.complete === true],
      ['Scoring session closed', view?.session?.status === 'closed'],
      ...(hasOrganizerDeductions
        ? [['Configured organizer deductions resolved', view?.deductionsResolved === true]] : []),
      ['Current official calculation saved', !!calculation],
      ['Independently verified', !!calculation?.verified || finalized],
      ['Round finalized', finalized],
      ['Next-round qualifiers confirmed', confirmed],
    ],
  }
}

export function nextRoundScorePolicy(configuration, advancement, nextRound) {
  if (nextRound?.progression === 'weighted') {
    const rounds = configuration?.rounds?.filter(round => round.purpose !== 'special') ?? advancement?.scoreContributions ?? []
    return `Final score contributions: ${rounds.map(round => `${round.name} ${round.weight ?? 0}%`).join(' + ')}.`
  }
  return nextRound?.progression === 'carry_forward' ? 'Carry forward: eligible previous-round scores contribute to the next round.' : 'Back to zero: the next round starts with new scores.'
}
