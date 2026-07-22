export function emailLayout({ title, preheader, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Inter,Segoe UI,sans-serif;color:#e2e8f0;">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader || title)}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1e293b;border-radius:16px;border:1px solid #334155;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">
                VOT<span style="color:#818cf8;">RIX</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;font-size:15px;line-height:1.6;color:#cbd5e1;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;font-size:12px;color:#64748b;">
              This is an automated message from VOTRIX. Please do not reply to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buttonHtml(href, label) {
  return `<p style="margin:24px 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;">
      ${escapeHtml(label)}
    </a>
  </p>`
}

export function infoBoxHtml(rows) {
  const items = rows
    .map(
      ([label, value, isMonospace]) =>
        `<tr><td style="padding:6px 0;color:#94a3b8;width:140px;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#f1f5f9;font-weight:500;${isMonospace ? 'font-family:Consolas,Monaco,monospace;letter-spacing:0.5px;' : ''}">${escapeHtml(value)}</td></tr>`,
    )
    .join('')

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#0f172a;border-radius:10px;padding:12px 16px;border:1px solid #334155;">${items}</table>`
}
