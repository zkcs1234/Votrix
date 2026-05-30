import { emailLayout, escapeHtml, buttonHtml } from './layout.js'

export function passwordResetTemplate({ resetUrl, expiresInMinutes }) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">Reset your password</h1>
    <p style="margin:0 0 16px;">We received a request to reset your VOTRIX password. Click the button below to choose a new password. This link expires in ${escapeHtml(String(expiresInMinutes))} minutes.</p>
    ${buttonHtml(resetUrl, 'Reset password')}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      If you did not request this, you can safely ignore this email.
    </p>
    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;word-break:break-all;">
      ${escapeHtml(resetUrl)}
    </p>
  `

  return emailLayout({
    title: 'VOTRIX Password Reset',
    preheader: 'Reset your VOTRIX password',
    bodyHtml,
  })
}
