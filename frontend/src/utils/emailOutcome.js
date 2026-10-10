export function getEmailOutcomeMessage(email) {
  if (email?.sent) return 'Credentials email sent.'
  if (email?.skipped) return `Email skipped: ${email.reason || 'the email safety rules blocked this send.'}`
  if (email?.error) return `Email failed: ${email.error}`
  return 'Email status is unavailable.'
}
