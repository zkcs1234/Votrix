import { emailLayout, escapeHtml, buttonHtml, infoBoxHtml } from './layout.js'

export function judgeInvitationRegisteredTemplate({
  email,
  eventLink,
  eventTitle,
  loginUrl,
}) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">You're invited as a judge</h1>
    <p style="margin:0 0 16px;">You have been invited to judge <strong style="color:#fff;">${escapeHtml(eventTitle)}</strong>. Sign in with your existing account to access this event.</p>
    ${infoBoxHtml([
      ['Event', eventTitle],
      ['Email', email],
    ])}
    ${buttonHtml(eventLink, 'Open scoring')}
    <p style="margin:8px 0 16px;font-size:13px;color:#94a3b8;">
      Sign in: <a href="${escapeHtml(loginUrl)}" style="color:#818cf8;">${escapeHtml(loginUrl)}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      Scoring link: <a href="${escapeHtml(eventLink)}" style="color:#818cf8;">${escapeHtml(eventLink)}</a>
    </p>
  `

  return emailLayout({
    title: `Judge Invitation: ${eventTitle}`,
    preheader: `You're invited to judge ${eventTitle}`,
    bodyHtml,
  })
}
