import { emailLayout, escapeHtml, buttonHtml } from './layout.js'

export function organizerInviteLinkTemplate({ applyUrl, expiresAt, note }) {
  const expires = expiresAt ? new Date(expiresAt).toUTCString() : null
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">You're invited to apply as an organizer</h1>
    <p style="margin:0 0 16px;">An administrator invited you to become a VOTRIX organizer. Use the button below to complete your application: your details, the access you need, and your supporting certificates. An administrator will review it before your account is created.</p>
    ${note ? `<p style="margin:0 0 16px;padding:12px;border-left:3px solid #818cf8;color:#cbd5e1;">${escapeHtml(note)}</p>` : ''}
    ${buttonHtml(applyUrl, 'Complete your application')}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      This link can be used once${expires ? ` and expires ${escapeHtml(expires)}` : ''}. If you did not expect this invitation you can safely ignore this email.
    </p>
    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;word-break:break-all;">
      ${escapeHtml(applyUrl)}
    </p>
  `

  return emailLayout({
    title: 'VOTRIX Organizer Invitation',
    preheader: 'Complete your VOTRIX organizer application',
    bodyHtml,
  })
}
