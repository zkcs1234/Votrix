import { emailLayout, escapeHtml, buttonHtml, infoBoxHtml } from './layout.js'

export function organizerInvitationTemplate({ email, temporaryPassword, loginUrl, forgotPasswordUrl }) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">You're invited as an organizer</h1>
    <p style="margin:0 0 16px;">An administrator created your VOTRIX organizer account. Use the credentials below to sign in. You will be asked to change your password on first login.</p>
    ${infoBoxHtml([
      ['Email', email],
      ['Temporary password', temporaryPassword, true],
    ])}
    ${buttonHtml(loginUrl, 'Sign in to VOTRIX')}
    <p style="margin:16px 0 16px;font-size:13px;color:#94a3b8;">
      Login link: <a href="${escapeHtml(loginUrl)}" style="color:#818cf8;">${escapeHtml(loginUrl)}</a>
    </p>
    ${forgotPasswordUrl ? `<p style="margin:0;font-size:12px;color:#64748b;">
      This temporary password replaces any earlier one — always use your most recent invitation email. Lost it? <a href="${escapeHtml(forgotPasswordUrl)}" style="color:#818cf8;">Set a new password</a>.
    </p>` : ''}
  `

  return emailLayout({
    title: 'VOTRIX Organizer Invitation',
    preheader: 'Your organizer account is ready',
    bodyHtml,
  })
}
