import { emailLayout, escapeHtml, buttonHtml, infoBoxHtml } from './layout.js'

export function eventNotificationTemplate({
  eventTitle,
  eventLink,
  message,
  organizationName,
  startDate,
  endDate,
}) {
  const rows = [['Event', eventTitle]]
  if (organizationName) rows.push(['Organization', organizationName])
  if (startDate) rows.push(['Starts', startDate])
  if (endDate) rows.push(['Ends', endDate])

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">Event update</h1>
    <p style="margin:0 0 16px;">${escapeHtml(message)}</p>
    ${infoBoxHtml(rows)}
    ${buttonHtml(eventLink, 'View event')}
  `

  return emailLayout({
    title: `Update: ${eventTitle}`,
    preheader: message.slice(0, 80),
    bodyHtml,
  })
}
