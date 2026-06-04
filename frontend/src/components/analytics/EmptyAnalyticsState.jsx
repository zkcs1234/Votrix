/**
 * EmptyAnalyticsState — placeholder shown when a module has no analytics data.
 * Pure: it does not know which module it is rendering for.
 */
import EmptyState from '@/components/ui/EmptyState'

export default function EmptyAnalyticsState({
  title = 'No analytics data yet',
  description = 'Activity will appear here as voters, judges, or respondents engage with your event.',
  actionLabel,
  onAction,
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  )
}
