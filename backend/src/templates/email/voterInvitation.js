import { emailLayout, escapeHtml, buttonHtml, infoBoxHtml } from './layout.js'

export function voterInvitationTemplate({
  email,
  temporaryPassword,
  eventLink,
  eventTitle,
  loginUrl,
}) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">You're invited to vote</h1>
    <p style="margin:0 0 16px;">You have been registered for <strong style="color:#fff;">${escapeHtml(eventTitle)}</strong>. Use your credentials to sign in and participate.</p>
    ${infoBoxHtml([
      ['Event', eventTitle],
      ['Email', email],
      ['Temporary password', temporaryPassword, true],
    ])}
    ${buttonHtml(eventLink, 'Open event')}
    <p style="margin:8px 0 16px;font-size:13px;color:#94a3b8;">
      Or sign in first: <a href="${escapeHtml(loginUrl)}" style="color:#818cf8;">${escapeHtml(loginUrl)}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      Event link: <a href="${escapeHtml(eventLink)}" style="color:#818cf8;">${escapeHtml(eventLink)}</a>
    </p>
  `

  return emailLayout({
    title: `Invitation: ${eventTitle}`,
    preheader: `You're invited to ${eventTitle}`,
    bodyHtml,
  })
}
