import { emailLayout, escapeHtml, buttonHtml, infoBoxHtml } from './layout.js'

export function judgeInvitationTemplate({
  email,
  temporaryPassword,
  eventLink,
  eventTitle,
  loginUrl,
}) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">You're invited as a competition judge</h1>
    <p style="margin:0 0 16px;">You have been assigned as a judge for <strong style="color:#fff;">${escapeHtml(eventTitle)}</strong>. Sign in to score contestants (one submission only).</p>
    ${infoBoxHtml([
      ['Event', eventTitle],
      ['Email', email],
      ['Temporary password', temporaryPassword, true],
    ])}
    ${buttonHtml(eventLink, 'Open scoring')}
    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">
      Sign in: <a href="${escapeHtml(loginUrl)}" style="color:#818cf8;">${escapeHtml(loginUrl)}</a>
    </p>
  `

  return emailLayout({
    title: `Judge invitation: ${eventTitle}`,
    preheader: `Judge for ${eventTitle}`,
    bodyHtml,
  })
}
