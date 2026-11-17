// For audit rows written while a student officer acts as the owner organizer:
// `user_id` is the owner (so the organization's history stays in one place) and
// the real person is recorded in details.actingUserId / actingUserEmail.
// Renders nothing for every other row.
export default function ActingUserNote({ log }) {
  const who = log?.details?.actingUserEmail || log?.details?.actingUserId
  if (!who) return null
  return (
    <p className="v-caption" title="Performed by a student officer acting for this organizer">
      by <span className="font-medium text-v-text-muted">{who}</span> (officer)
    </p>
  )
}
