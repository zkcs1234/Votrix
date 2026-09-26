import { emailLayout, escapeHtml, buttonHtml, infoBoxHtml } from './layout.js'

// Email A — account provisioning (plan D11). Sent by the admin at registration,
// once per new account. It carries the temporary password and login link but is
// NOT tied to any event; the event invitation (Email B) is sent separately by
// the organizer.
export function voterAccountCreatedTemplate({ email, temporaryPassword, loginUrl, forgotPasswordUrl }) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">Your VOTRIX account is ready</h1>
    <p style="margin:0 0 16px;">An administrator created your VOTRIX account. Use the credentials below to sign in. You will be asked to change your password on first login.</p>
    ${infoBoxHtml([
      ['Email', email],
      ['Temporary password', temporaryPassword, true],
    ])}
    ${buttonHtml(loginUrl, 'Sign in to VOTRIX')}
    <p style="margin:16px 0 16px;font-size:13px;color:#94a3b8;">
      Login link: <a href="${escapeHtml(loginUrl)}" style="color:#818cf8;">${escapeHtml(loginUrl)}</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">You'll be notified separately when you're invited to an event to vote, score, or respond.</p>
    ${forgotPasswordUrl ? `<p style="margin:0;font-size:12px;color:#64748b;">
      This temporary password replaces any earlier one. Lost it? <a href="${escapeHtml(forgotPasswordUrl)}" style="color:#818cf8;">Set a new password</a>.
    </p>` : ''}
  `

  return emailLayout({
    title: 'Your VOTRIX account',
    preheader: 'Your account is ready — sign in to get started',
    bodyHtml,
  })
}
