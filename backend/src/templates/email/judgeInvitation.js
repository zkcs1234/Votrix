import { emailLayout, escapeHtml, buttonHtml, infoBoxHtml } from './layout.js'

export function judgeInvitationTemplate({
  email,
  temporaryPassword,
  eventLink,
  eventTitle,
  loginUrl,
  forgotPasswordUrl,
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
    <p style="margin:8px 0 16px;font-size:13px;color:#94a3b8;">
      Sign in: <a href="${escapeHtml(loginUrl)}" style="color:#818cf8;">${escapeHtml(loginUrl)}</a>
    </p>
    ${forgotPasswordUrl ? `<p style="margin:0;font-size:12px;color:#64748b;">
      This temporary password replaces any earlier one — always use your most recent invitation email. Lost it? <a href="${escapeHtml(forgotPasswordUrl)}" style="color:#818cf8;">Set a new password</a>.
    </p>` : ''}
  `

  return emailLayout({
    title: `Judge invitation: ${eventTitle}`,
    preheader: `Judge for ${eventTitle}`,
    bodyHtml,
  })
}
