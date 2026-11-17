import { emailLayout, escapeHtml } from './layout.js'

export function organizerApplicationDeclinedTemplate({ organizerName, reason }) {
  const greeting = organizerName ? `Hello ${escapeHtml(organizerName)},` : 'Hello,'
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">Your organizer application was not approved</h1>
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">After review, an administrator was unable to approve your VOTRIX organizer application.</p>
    <p style="margin:0 0 16px;padding:12px;border-left:3px solid #f87171;color:#cbd5e1;">${escapeHtml(reason)}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      If you believe this is a mistake, please contact your administrator.
    </p>
  `

  return emailLayout({
    title: 'VOTRIX Organizer Application',
    preheader: 'Update on your VOTRIX organizer application',
    bodyHtml,
  })
}
