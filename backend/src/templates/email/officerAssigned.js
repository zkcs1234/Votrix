import { emailLayout, escapeHtml, buttonHtml } from './layout.js'

export function officerAssignedTemplate({ studentName, organizationName, position, workspaceUrl }) {
  const greeting = studentName ? `Hello ${escapeHtml(studentName)},` : 'Hello,'
  const org = organizationName ? escapeHtml(organizationName) : 'an organization'
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">You've been added as an officer</h1>
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;"><strong>${org}</strong> added you as <strong>${escapeHtml(position)}</strong>. You can now manage its events from VOTRIX. Sign in and use <em>Open organizer workspace</em> on your dashboard.</p>
    ${buttonHtml(workspaceUrl, 'Open VOTRIX')}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      Your student account works exactly as before. Actions you take in the organizer workspace are recorded under your name. If you weren't expecting this, contact the organization.
    </p>
  `

  return emailLayout({
    title: 'VOTRIX Officer Access',
    preheader: `You've been added as ${position}`,
    bodyHtml,
  })
}
